import type { FeedItem, MapPlace, Visit } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('visit privacy', () => {
  const ctx = setupTestApp();

  /** alice has friends bob (close friend) and carol (regular friend). */
  async function world() {
    const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    expect((await as(ctx.app, alice!).put(`/me/close-friends/${bob!.id}`)).statusCode).toBe(204);
    ctx.places.add('open', 'Open Kitchen');
    ctx.places.add('inner', 'Inner Circle');
    ctx.places.add('secret', 'Secret Spot');
    const log = async (place: string, audience: string) =>
      (
        await as(ctx.app, alice!).post('/visits', {
          googlePlaceId: place,
          visitedAt: '2026-10-01',
          audience,
          review: { rating: 5, recommends: true, body: `${audience} review` },
        })
      ).json() as Promise<Visit>;
    const open = await log('open', 'friends');
    const inner = await log('inner', 'close_friends');
    const secret = await log('secret', 'private');
    return { alice: alice!, bob: bob!, carol: carol!, open, inner, secret };
  }

  /** Every place a review could surface, as seen by `viewer`. */
  async function everything(viewer: TestUser, restaurantIds: string[]) {
    const api = as(ctx.app, viewer);
    const feed = ((await api.get('/feed')).json().items as FeedItem[]).map((i) => i.review.body);
    const map = ((await api.get('/map/places')).json() as MapPlace[]).map((p) => p.restaurant.name);
    const profile = ((await api.get('/users/alice/visits')).json() as Visit[]).map((v) => v.restaurant.name);
    const stats = (await api.get('/users/alice')).json().stats;
    const details = await Promise.all(restaurantIds.map(async (id) => (await api.get(`/restaurants/${id}`)).json()));
    const detailReviews = details.flatMap((d) => d.reviews.map((r: FeedItem) => r.review.body));
    return { feed, map, profile, stats, detailReviews, detailVisits: details.map((d) => d.friendStats.visits) };
  }

  it('regular friends see only "friends" visits, everywhere', async () => {
    const w = await world();
    const seen = await everything(w.carol, [w.open.restaurant.id, w.inner.restaurant.id, w.secret.restaurant.id]);
    expect(seen.feed).toEqual(['friends review']);
    expect(seen.map).toEqual(['Open Kitchen']);
    expect(seen.profile).toEqual(['Open Kitchen']);
    expect(seen.stats).toEqual({ visits: 1, reviews: 1, friends: 2 });
    expect(seen.detailReviews).toEqual(['friends review']);
    expect(seen.detailVisits).toEqual([1, 0, 0]);
  });

  it('close friends also see "close friends" visits, but never private ones', async () => {
    const w = await world();
    const seen = await everything(w.bob, [w.open.restaurant.id, w.inner.restaurant.id, w.secret.restaurant.id]);
    expect(seen.feed.sort()).toEqual(['close_friends review', 'friends review']);
    expect(seen.map.sort()).toEqual(['Inner Circle', 'Open Kitchen']);
    expect(seen.profile.sort()).toEqual(['Inner Circle', 'Open Kitchen']);
    expect(seen.stats.visits).toBe(2);
    expect(seen.detailVisits).toEqual([1, 1, 0]);
    expect(JSON.stringify(seen)).not.toContain('private review');
  });

  it('the author always sees all of their own visits', async () => {
    const w = await world();
    const mine = (await as(ctx.app, w.alice).get('/me/visits')).json() as Visit[];
    expect(mine.map((v) => v.audience).sort()).toEqual(['close_friends', 'friends', 'private']);
    const map = (await as(ctx.app, w.alice).get('/map/places?scope=me')).json() as MapPlace[];
    expect(map).toHaveLength(3);
    expect((await as(ctx.app, w.alice).get(`/restaurants/${w.secret.restaurant.id}`)).json().reviews).toHaveLength(1);
  });

  it('filtering the map by one friend respects their audiences', async () => {
    const w = await world();
    const asCarol = (await as(ctx.app, w.carol).get(`/map/places?scope=friend&friendId=${w.alice.id}`)).json() as MapPlace[];
    expect(asCarol.map((p) => p.restaurant.name)).toEqual(['Open Kitchen']);
    const asBob = (await as(ctx.app, w.bob).get(`/map/places?scope=friend&friendId=${w.alice.id}`)).json() as MapPlace[];
    expect(asBob.map((p) => p.restaurant.name).sort()).toEqual(['Inner Circle', 'Open Kitchen']);
  });

  it('removing someone from close friends hides those visits again', async () => {
    const w = await world();
    await as(ctx.app, w.alice).delete(`/me/close-friends/${w.bob.id}`);
    const seen = await everything(w.bob, [w.inner.restaurant.id]);
    expect(seen.feed).toEqual(['friends review']);
    expect(seen.detailVisits).toEqual([0]);
  });

  it('unfriending clears close-friend status, so re-friending does not restore it', async () => {
    const w = await world();
    await as(ctx.app, w.alice).delete(`/friends/${w.bob.id}`);
    await befriend(ctx.app, w.alice, w.bob);
    const friends = (await as(ctx.app, w.alice).get('/friends')).json();
    expect(friends.find((f: { username: string }) => f.username === 'bob').closeFriend).toBe(false);
    expect((await everything(w.bob, [])).feed).toEqual(['friends review']);
  });

  it('only friends can be close friends', async () => {
    const w = await world();
    const dave = await signup(ctx.app, 'dave');
    expect((await as(ctx.app, w.alice).put(`/me/close-friends/${dave.id}`)).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).put(`/me/close-friends/${w.alice.id}`)).statusCode).toBe(400);
  });

  it('the author can change a visit\'s audience; nobody else can', async () => {
    const w = await world();
    expect((await as(ctx.app, w.carol).patch(`/visits/${w.secret.id}`, { audience: 'friends' })).statusCode).toBe(404);
    expect((await as(ctx.app, w.alice).patch(`/visits/${w.secret.id}`, { audience: 'friends' })).statusCode).toBe(200);
    expect((await everything(w.carol, [])).map.sort()).toEqual(['Open Kitchen', 'Secret Spot']);
  });

  it('remembers the last audience as the default for the next visit', async () => {
    const w = await world();
    // The last visit in world() was private.
    expect((await as(ctx.app, w.alice).get('/me')).json().defaultAudience).toBe('private');
    ctx.places.add('next', 'Next Place');
    const next = (await as(ctx.app, w.alice).post('/visits', { googlePlaceId: 'next', visitedAt: '2026-10-02' })).json();
    expect(next.audience).toBe('private');
  });
});
