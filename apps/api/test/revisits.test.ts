import type { Visit } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup } from './helpers';

describe('revisits', () => {
  const ctx = setupTestApp();

  it("returns only your own visits to one restaurant, newest first", async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await befriend(ctx.app, alice, bob);
    ctx.places.add('luigi', "Luigi's");
    ctx.places.add('other', 'Other');
    const log = (u: typeof alice, place: string, visitedAt: string, rating?: number) =>
      as(ctx.app, u).post('/visits', {
        googlePlaceId: place,
        visitedAt,
        review: rating ? { rating, recommends: rating >= 4 } : undefined,
      });
    const first = (await log(alice, 'luigi', '2026-03-01', 3)).json();
    await log(alice, 'luigi', '2026-06-01', 4);
    await log(alice, 'luigi', '2026-09-01');
    await log(alice, 'other', '2026-09-02', 5);
    await log(bob, 'luigi', '2026-09-03', 1);

    const visits = (await as(ctx.app, alice).get(`/restaurants/${first.restaurant.id}/my-visits`)).json() as Visit[];
    expect(visits.map((v) => [v.visitedAt, v.review?.rating ?? null])).toEqual([
      ['2026-09-01', null],
      ['2026-06-01', 4],
      ['2026-03-01', 3],
    ]);
  });
});
