import type { FeedItem, NotificationItem, TaggedVisit, Visit } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('tagging who you ate with', () => {
  const ctx = setupTestApp();

  async function world() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('luigi', "Luigi's");
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave! };
  }
  const logWith = (u: TestUser, companionIds: string[], extra: object = {}) =>
    as(ctx.app, u).post('/visits', {
      googlePlaceId: 'luigi',
      visitedAt: '2026-10-03',
      companionIds,
      review: { rating: 5, recommends: true, body: 'Group dinner' },
      ...extra,
    });

  it('tags friends, shows them on the visit, and notifies them', async () => {
    const w = await world();
    const res = await logWith(w.alice, [w.bob.id, w.carol.id]);
    expect(res.statusCode).toBe(201);
    expect((res.json() as Visit).companions.map((c) => c.username)).toEqual(['bob', 'carol']);
    const feed = (await as(ctx.app, w.bob).get('/feed')).json().items as FeedItem[];
    expect(feed[0]!.companions.map((c) => c.username)).toEqual(['bob', 'carol']);
    const inbox = (await as(ctx.app, w.bob).get('/notifications')).json().items as NotificationItem[];
    expect(inbox.find((n) => n.type === 'tagged')).toMatchObject({ actor: { username: 'alice' }, restaurant: { name: "Luigi's" } });
  });

  it('refuses to tag people who are not your friends', async () => {
    const w = await world();
    expect((await logWith(w.alice, [w.dave.id])).statusCode).toBe(400);
  });

  it('lets tagged friends see the visit even when it is private', async () => {
    const w = await world();
    await logWith(w.alice, [w.bob.id], { audience: 'private' });
    expect(((await as(ctx.app, w.bob).get('/feed')).json().items as FeedItem[])).toHaveLength(1);
    expect(((await as(ctx.app, w.carol).get('/feed')).json().items as FeedItem[])).toHaveLength(0);
  });

  it('lists pending tags, and logging your own visit from one links it back', async () => {
    const w = await world();
    const original = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    const pending = (await as(ctx.app, w.bob).get('/me/tagged')).json() as TaggedVisit[];
    expect(pending.map((p) => [p.by.username, p.restaurant.name])).toEqual([['alice', "Luigi's"]]);

    const mine = (
      await as(ctx.app, w.bob).post('/visits', {
        googlePlaceId: 'luigi',
        visitedAt: '2026-10-03',
        fromVisitId: original.id,
        review: { rating: 4, recommends: true },
      })
    ).json() as Visit;
    // Bob's visit is "with alice", and the tag is no longer pending.
    expect(mine.companions.map((c) => c.username)).toEqual(['alice']);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
    // Alice isn't told she was tagged back on a visit she started.
    const aliceInbox = (await as(ctx.app, w.alice).get('/notifications')).json().items as NotificationItem[];
    expect(aliceInbox.filter((n) => n.type === 'tagged')).toEqual([]);
  });

  it("can't link from a visit you weren't tagged on", async () => {
    const w = await world();
    const original = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    const res = await as(ctx.app, w.carol).post('/visits', { googlePlaceId: 'luigi', visitedAt: '2026-10-03', fromVisitId: original.id });
    expect(res.statusCode).toBe(404);
  });

  it('lets you untag yourself', async () => {
    const w = await world();
    const original = (await logWith(w.alice, [w.bob.id], { audience: 'private' })).json() as Visit;
    expect((await as(ctx.app, w.bob).delete(`/visits/${original.id}/companions/me`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
    // Untagged from a private visit, bob can no longer see it.
    expect(((await as(ctx.app, w.bob).get('/feed')).json().items as FeedItem[])).toHaveLength(0);
  });
});
