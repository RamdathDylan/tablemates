import type { Friend, ForYouItem, Profile } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('taste match and For You', () => {
  const ctx = setupTestApp();
  const rate = (u: TestUser, place: string, rating: number, extra: object = {}) =>
    as(ctx.app, u).post('/visits', {
      googlePlaceId: place,
      visitedAt: '2026-10-01',
      review: { rating, recommends: rating >= 4 },
      ...extra,
    });

  /**
   * alice, bob, and carol all rated A, B, C. bob agrees with alice exactly;
   * carol is 2 stars off every time; dave shares only one place. eve is a stranger.
   */
  async function world() {
    const [alice, bob, carol, dave, eve] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'eve'].map((n) => signup(ctx.app, n)));
    for (const f of [bob!, carol!, dave!]) await befriend(ctx.app, alice!, f);
    for (const id of ['a', 'b', 'c', 'x', 'y', 'z', 'w', 'low', 'stranger']) ctx.places.add(id, `Place ${id.toUpperCase()}`);
    for (const [place, r] of [['a', 5], ['b', 4], ['c', 3]] as const) {
      await rate(alice!, place, r);
      await rate(bob!, place, r);
      await rate(carol!, place, r >= 3 ? r - 2 : r + 2);
    }
    await rate(dave!, 'a', 5);
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, eve: eve! };
  }

  it('scores friends by how closely your stars agree, once you share 3 places', async () => {
    const w = await world();
    const friends = (await as(ctx.app, w.alice).get('/friends')).json() as Friend[];
    const match = Object.fromEntries(friends.map((f) => [f.username, f.tasteMatch]));
    expect(match).toEqual({ bob: 100, carol: 50, dave: null });
  });

  it("shows the comparison on a friend's profile", async () => {
    const w = await world();
    const { taste } = (await as(ctx.app, w.alice).get('/users/carol')).json() as Profile;
    expect(taste).toMatchObject({ match: 50, overlap: 3 });
    expect(taste!.agree).toHaveLength(3);
    expect(taste!.agree[0]).toMatchObject({ you: expect.any(Number), them: expect.any(Number) });
    expect(((await as(ctx.app, w.alice).get('/users/eve')).json() as Profile).taste).toBeUndefined();
  });

  it("ignores reviews you can't see when matching", async () => {
    const w = await world();
    // A 4th shared place, rated far apart, but private: it must not drag bob's match down.
    await rate(w.alice, 'w', 5);
    await rate(w.bob, 'w', 1, { audience: 'private' });
    const friends = (await as(ctx.app, w.alice).get('/friends')).json() as Friend[];
    expect(friends.find((f) => f.username === 'bob')!.tasteMatch).toBe(100);
  });

  it('recommends unvisited places, weighting friends by taste match', async () => {
    const w = await world();
    await rate(w.bob, 'x', 5); // 100% match
    await rate(w.carol, 'y', 5); // 50% match
    await rate(w.dave, 'z', 5); // not enough overlap: weighted as 60%
    await rate(w.bob, 'low', 3); // below 4★: never recommended
    await rate(w.bob, 'a', 5); // alice has been
    await rate(w.eve, 'stranger', 5); // not a friend
    await rate(w.bob, 'w', 5, { audience: 'private' }); // hidden from alice

    const items = (await as(ctx.app, w.alice).get('/for-you')).json() as ForYouItem[];
    expect(items.map((i) => i.restaurant.name)).toEqual(['Place X', 'Place Z', 'Place Y']);
    expect(items[0]!.reasons).toEqual([{ user: expect.objectContaining({ username: 'bob' }), rating: 5, match: 100 }]);
    expect(items[0]!.recommends).toBe(1);
  });

  it('boosts nearby places when a location is given', async () => {
    const w = await world();
    ctx.places.add('near', 'Near Spot', { lat: 40.7, lng: -74 });
    ctx.places.add('far', 'Far Spot', { lat: 41.2, lng: -74 });
    await rate(w.bob, 'near', 5);
    await rate(w.bob, 'far', 5);
    const items = (await as(ctx.app, w.alice).get('/for-you?lat=40.7&lng=-74')).json() as ForYouItem[];
    expect(items.map((i) => i.restaurant.name)).toEqual(['Near Spot', 'Far Spot']);
    expect(items[0]!.distanceKm).toBe(0);
  });
});
