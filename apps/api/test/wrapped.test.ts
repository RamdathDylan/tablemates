import type { Wrapped } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('year in review', () => {
  const ctx = setupTestApp();
  const log = (u: TestUser, place: string, visitedAt: string, rating?: number, extra: object = {}) =>
    as(ctx.app, u).post('/visits', {
      googlePlaceId: place,
      visitedAt,
      review: rating ? { rating, recommends: rating >= 4 } : undefined,
      ...extra,
    });

  it("summarizes only the viewer's own visits in that year", async () => {
    const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('luigi', "Luigi's", { cuisine: ['Italian'] });
    ctx.places.add('sushi', 'Sushi Zen', { cuisine: ['Japanese', 'Sushi'] });
    ctx.places.add('taco', 'Taco Town', { cuisine: ['Mexican'] });

    await log(alice!, 'luigi', '2025-12-30', 4); // last year: Luigi's isn't new in 2026
    await log(alice!, 'luigi', '2026-01-03', 3, { companionIds: [bob!.id] }); // a Saturday
    await log(alice!, 'luigi', '2026-03-14', 4, { audience: 'private' });
    await log(alice!, 'sushi', '2026-03-20', 5, { companionIds: [bob!.id, carol!.id] });
    await log(alice!, 'taco', '2026-10-02');
    await log(bob!, 'taco', '2026-06-01', 5, { companionIds: [alice!.id] }); // bob tagged alice
    await log(carol!, 'sushi', '2026-05-05', 1); // not alice's visit

    const w = (await as(ctx.app, alice!).get('/me/wrapped?year=2026')).json() as Wrapped;
    expect(w.totals).toEqual({ visits: 4, places: 3, newPlaces: 2, reviews: 3, recommendations: 2 });
    expect(w.topRestaurants.map((r) => [r.restaurant.name, r.visits])).toEqual([
      ["Luigi's", 2],
      ['Sushi Zen', 1],
      ['Taco Town', 1],
    ]);
    expect(w.topCuisines[0]).toEqual({ name: 'Italian', visits: 2 });
    expect(w.byMonth).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    expect(w.byWeekday[6]).toBe(2); // Jan 3 and Mar 14, 2026 are Saturdays
    // Bob: tagged twice by alice + tagged alice once.
    expect(w.companions.map((c) => [c.user.username, c.visits])).toEqual([
      ['bob', 3],
      ['carol', 1],
    ]);
    expect(w.bestNewFind).toMatchObject({ restaurant: { name: 'Sushi Zen' }, rating: 5 });
  });

  it('returns an empty recap for a quiet year', async () => {
    const alice = await signup(ctx.app, 'alice');
    const w = (await as(ctx.app, alice).get('/me/wrapped?year=2026')).json() as Wrapped;
    expect(w.totals.visits).toBe(0);
    expect(w.bestNewFind).toBeNull();
    expect(w.byMonth.every((n) => n === 0)).toBe(true);
  });
});
