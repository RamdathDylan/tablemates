import type { Badge, Challenge, ChallengeSummary, NotificationItem, Page } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { runChallenges } from '../src/lib/challenges';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('friend challenges', () => {
  const ctx = setupTestApp();

  /** maya challenges her friends bob and carol (not friends with each other); dave is a stranger. */
  async function world(metric = 'new_places', target = 2) {
    const [maya, bob, carol, dave] = await Promise.all(['maya', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    await befriend(ctx.app, maya!, carol!);
    ctx.places.add('a', 'Taco A', { cuisine: ['Mexican'] });
    ctx.places.add('b', 'Ramen B', { cuisine: ['Japanese'] });
    ctx.places.add('c', 'Pizza C', { cuisine: ['Italian', 'Pizza'] });
    const res = await as(ctx.app, maya!).post('/challenges', {
      title: 'October explorer',
      metric,
      target,
      startsOn: '2026-10-01',
      endsOn: '2026-10-31',
      memberIds: [bob!.id, carol!.id],
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().id as string;
    await as(ctx.app, bob!).post(`/challenges/${id}/join`);
    const log = (u: TestUser, place: string, visitedAt: string, extra: object = {}) =>
      as(ctx.app, u).post('/visits', { googlePlaceId: place, visitedAt, ...extra });
    return { maya: maya!, bob: bob!, carol: carol!, dave: dave!, id, log };
  }
  const board = async (u: TestUser, id: string) =>
    ((await as(ctx.app, u).get(`/challenges/${id}`)).json() as Challenge).leaderboard.map((s) => [s.user.username, s.count]);
  const alerts = async (u: TestUser, type: string) =>
    ((await as(ctx.app, u).get('/notifications')).json() as Page<NotificationItem>).items.filter((n) => n.type === type);

  it('invites friends only, and hides the challenge from everyone else', async () => {
    const w = await world();
    expect((await as(ctx.app, w.maya).post('/challenges', { title: 'x', metric: 'visits', target: 3, startsOn: '2026-10-01', endsOn: '2026-10-10', memberIds: [w.dave.id] })).statusCode).toBe(400);
    expect((await as(ctx.app, w.dave).get(`/challenges/${w.id}`)).statusCode).toBe(404);
    expect((await alerts(w.carol, 'challenge_invite')).map((n) => [n.actor.username, n.excerpt])).toEqual([['maya', 'October explorer']]);
    const carols = (await as(ctx.app, w.carol).get('/challenges')).json() as ChallengeSummary[];
    expect(carols.map((c) => [c.title, c.status, c.memberCount])).toEqual([['October explorer', 'invited', 2]]);
    const detail = (await as(ctx.app, w.carol).get(`/challenges/${w.id}`)).json() as Challenge;
    expect(detail.invited.map((u) => u.username)).toEqual(['carol']);
  });

  it('counts new places in the window, skipping private visits and places visited before', async () => {
    const w = await world();
    await w.log(w.maya, 'a', '2026-09-20'); // before the challenge
    await w.log(w.maya, 'a', '2026-10-05'); // so not new
    await w.log(w.maya, 'b', '2026-10-06');
    await w.log(w.maya, 'c', '2026-10-07', { audience: 'private' });
    for (const [p, d] of [['a', '2026-10-03'], ['b', '2026-10-04'], ['c', '2026-11-02']]) await w.log(w.bob, p!, d!);
    // Joined members only: carol hasn't joined.
    expect(await board(w.carol, w.id)).toEqual([['bob', 2], ['maya', 1]]);
  });

  it('counts only visits shared with all friends, so close-friends visits stay off the leaderboard', async () => {
    const w = await world('visits', 5);
    await w.log(w.bob, 'a', '2026-10-02');
    await w.log(w.bob, 'b', '2026-10-03', { audience: 'close_friends' });
    await w.log(w.bob, 'c', '2026-10-04', { audience: 'private' });
    expect(await board(w.carol, w.id)).toEqual([['bob', 1], ['maya', 0]]);
  });

  it('counts cuisines, visits, and reviews too', async () => {
    const cuisines = await world('cuisines', 3);
    await cuisines.log(cuisines.bob, 'a', '2026-10-02');
    await cuisines.log(cuisines.bob, 'c', '2026-10-03');
    expect(await board(cuisines.maya, cuisines.id)).toEqual([['bob', 3], ['maya', 0]]);
  });

  it('marks completions once, then announces the winner and awards a badge when it ends', async () => {
    const w = await world();
    await w.log(w.bob, 'a', '2026-10-03');
    await w.log(w.bob, 'b', '2026-10-04');
    await w.log(w.maya, 'c', '2026-10-05');

    await runChallenges(ctx.db, new Date('2026-10-20T12:00:00Z'));
    await runChallenges(ctx.db, new Date('2026-10-20T12:05:00Z'));
    expect((await alerts(w.bob, 'challenge_complete')).map((n) => n.count)).toEqual([2]);
    expect(await alerts(w.maya, 'challenge_complete')).toEqual([]);
    expect(await alerts(w.bob, 'challenge_ended')).toEqual([]);

    await runChallenges(ctx.db, new Date('2026-11-01T12:00:00Z'));
    await runChallenges(ctx.db, new Date('2026-11-01T12:05:00Z'));
    for (const u of [w.bob, w.maya]) {
      expect((await alerts(u, 'challenge_ended')).map((n) => [n.actor.username, n.count])).toEqual([['bob', 2]]);
    }
    expect(await alerts(w.carol, 'challenge_ended')).toEqual([]);
    const badges = (await as(ctx.app, w.maya).get('/users/bob/badges')).json() as Badge[];
    expect(badges.map((b) => b.key)).toContain('challenge_winner');
    expect(((await as(ctx.app, w.bob).get(`/challenges/${w.id}`)).json() as Challenge).ended).toBe(true);
    expect((await as(ctx.app, w.carol).post(`/challenges/${w.id}/join`)).statusCode).toBe(400);
  });

  it('lets members leave and the creator invite more, but not leave', async () => {
    const w = await world();
    expect((await as(ctx.app, w.maya).post(`/challenges/${w.id}/leave`)).statusCode).toBe(400);
    expect((await as(ctx.app, w.bob).post(`/challenges/${w.id}/leave`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).get(`/challenges/${w.id}`)).statusCode).toBe(404);
    expect((await as(ctx.app, w.carol).post(`/challenges/${w.id}/members`, { userIds: [w.maya.id] })).statusCode).toBe(403);
    expect((await as(ctx.app, w.maya).post(`/challenges/${w.id}/members`, { userIds: [w.bob.id, w.carol.id] })).json()).toEqual({ added: 1 });
  });
});
