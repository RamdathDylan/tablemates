import { readFileSync } from 'node:fs';

import type { FeedItem, NotificationItem, RestaurantDetail, TaggedVisit, Visit } from '@tablemates/shared';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { visitCompanions, visits } from '../src/db/schema';

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

  it('refuses to tag anyone on an "Only me" visit, including by default', async () => {
    const w = await world();
    expect((await logWith(w.alice, [w.bob.id], { audience: 'private' })).statusCode).toBe(400);
    // The default audience follows the last visit, so a tag on a default-private visit is refused too.
    await as(ctx.app, w.alice).post('/visits', { googlePlaceId: 'luigi', visitedAt: '2026-10-01', audience: 'private' });
    expect((await logWith(w.alice, [w.bob.id])).statusCode).toBe(400);
    expect((await as(ctx.app, w.bob).get('/notifications')).json().items.filter((n: NotificationItem) => n.type === 'tagged')).toEqual([]);
  });

  it('never shows a private visit to a friend tagged on it before the rule existed', async () => {
    const w = await world();
    const visit = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    // A legacy row: tagged, then made private directly in the database.
    await ctx.db.update(visits).set({ audience: 'private' }).where(eq(visits.id, visit.id));
    expect((await as(ctx.app, w.bob).get('/feed')).json().items).toEqual([]);
    expect(((await as(ctx.app, w.bob).get(`/restaurants/${visit.restaurant.id}`)).json() as RestaurantDetail).reviews).toEqual([]);
    expect((await as(ctx.app, w.bob).get('/users/alice/visits')).json()).toEqual([]);
    expect((await as(ctx.app, w.bob).get('/map/places')).json()).toEqual([]);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
  });

  it('the data migration removes tags and tag alerts from private visits', async () => {
    const w = await world();
    const visit = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    const kept = (await logWith(w.alice, [w.carol.id])).json() as Visit;
    await ctx.db.update(visits).set({ audience: 'private' }).where(eq(visits.id, visit.id));
    const file = readFileSync(new URL('../drizzle/0026_private_visit_companions.sql', import.meta.url), 'utf8');
    // Running it twice proves it is safe to re-run.
    for (let i = 0; i < 2; i++) {
      for (const statement of file.split('--> statement-breakpoint')) await ctx.db.execute(sql.raw(statement));
    }
    const left = await ctx.db.select().from(visitCompanions);
    expect(left.map((c) => c.visitId)).toEqual([kept.id]);
    const bobAlerts = (await as(ctx.app, w.bob).get('/notifications')).json().items as NotificationItem[];
    expect(bobAlerts.filter((n) => n.type === 'tagged')).toEqual([]);
  });

  it('making a tagged visit Only me requires confirming that the tags will be removed', async () => {
    const w = await world();
    const visit = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    expect((await as(ctx.app, w.alice).patch(`/visits/${visit.id}`, { audience: 'private' })).statusCode).toBe(400);
    expect((await as(ctx.app, w.bob).get('/feed')).json().items).toHaveLength(1);

    expect((await as(ctx.app, w.alice).patch(`/visits/${visit.id}`, { audience: 'private', removeCompanions: true })).statusCode).toBe(200);
    expect((await as(ctx.app, w.bob).get('/feed')).json().items).toEqual([]);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
    const bobAlerts = (await as(ctx.app, w.bob).get('/notifications')).json().items as NotificationItem[];
    expect(bobAlerts.filter((n) => n.type === 'tagged')).toEqual([]);
  });

  it('logging your side of a tagged visit privately links it without tagging anyone back', async () => {
    const w = await world();
    const original = (await logWith(w.alice, [w.bob.id])).json() as Visit;
    const res = await as(ctx.app, w.bob).post('/visits', { googlePlaceId: 'luigi', visitedAt: '2026-10-03', fromVisitId: original.id, audience: 'private' });
    expect(res.statusCode).toBe(201);
    expect((res.json() as Visit).companions).toEqual([]);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
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
    // Bob isn't on alice's close friends list, so only the tag lets him see this visit.
    const original = (await logWith(w.alice, [w.bob.id], { audience: 'close_friends' })).json() as Visit;
    expect(((await as(ctx.app, w.bob).get('/feed')).json().items as FeedItem[])).toHaveLength(1);
    expect((await as(ctx.app, w.bob).delete(`/visits/${original.id}/companions/me`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).get('/me/tagged')).json()).toEqual([]);
    expect(((await as(ctx.app, w.bob).get('/feed')).json().items as FeedItem[])).toHaveLength(0);
  });
});
