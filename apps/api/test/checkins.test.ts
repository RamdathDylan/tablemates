import type { CheckinsResponse, NotificationItem, Page } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { checkins } from '../src/db/schema';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('out now', () => {
  const ctx = setupTestApp();

  /** maya has friends bob (close friend) and carol (regular friend); dave is a stranger. */
  async function world() {
    const [maya, bob, carol, dave] = await Promise.all(['maya', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    await befriend(ctx.app, maya!, carol!);
    await as(ctx.app, maya!).put(`/me/close-friends/${bob!.id}`);
    ctx.places.add('joes', "Joe's Pizza");
    ctx.places.add('ramen', 'Ramen Bar');
    return { maya: maya!, bob: bob!, carol: carol!, dave: dave! };
  }
  const out = async (u: TestUser) => (await as(ctx.app, u).get('/checkins')).json() as CheckinsResponse;
  const inbox = async (u: TestUser) => ((await as(ctx.app, u).get('/notifications')).json() as Page<NotificationItem>).items;

  it('shows a check-in to friends only, and close-friends check-ins to close friends only', async () => {
    const w = await world();
    expect((await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes' })).statusCode).toBe(201);
    expect((await out(w.maya)).mine).toMatchObject({ restaurant: { name: "Joe's Pizza" }, audience: 'friends' });
    expect((await out(w.carol)).friends.map((c) => [c.user.username, c.restaurant.name])).toEqual([['maya', "Joe's Pizza"]]);
    expect((await out(w.dave)).friends).toEqual([]);

    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'ramen', audience: 'close_friends' });
    expect((await out(w.bob)).friends.map((c) => c.restaurant.name)).toEqual(['Ramen Bar']);
    expect((await out(w.carol)).friends).toEqual([]);
  });

  it('keeps one live check-in per person and ends it on request', async () => {
    const w = await world();
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes' });
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'ramen' });
    expect((await out(w.carol)).friends.map((c) => c.restaurant.name)).toEqual(['Ramen Bar']);
    expect((await as(ctx.app, w.maya).delete('/checkins/me')).statusCode).toBe(204);
    expect(await out(w.maya)).toEqual({ mine: null, friends: [] });
    expect((await out(w.carol)).friends).toEqual([]);
  });

  it('expires on its own', async () => {
    const w = await world();
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes', hours: 1 });
    const [row] = await ctx.db.select().from(checkins);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(60 * 60 * 1000);
    // An hour later:
    await ctx.db.update(checkins).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await out(w.carol)).friends).toEqual([]);
    expect((await out(w.maya)).mine).toBeNull();
    expect((await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes', hours: 7 })).statusCode).toBe(400);
  });

  it('alerts close friends only when asked, and only close friends', async () => {
    const w = await world();
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes' });
    expect(await inbox(w.bob)).toEqual([]);
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes', notifyCloseFriends: true });
    expect((await inbox(w.bob)).map((n) => [n.type, n.actor.username, n.restaurant?.name])).toEqual([['checkin', 'maya', "Joe's Pizza"]]);
    expect(await inbox(w.carol)).toEqual([]);
    expect(await inbox(w.dave)).toEqual([]);
  });

  it('stops showing check-ins once you unfriend', async () => {
    const w = await world();
    await as(ctx.app, w.maya).post('/checkins', { googlePlaceId: 'joes' });
    await as(ctx.app, w.carol).delete(`/friends/${w.maya.id}`);
    expect((await out(w.carol)).friends).toEqual([]);
  });
});
