import type { Blend } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { clearTasteCache } from '../src/lib/taste';
import { as, befriend, logVisit, setupTestApp, signup, type TestUser } from './helpers';

describe('blend', () => {
  const ctx = setupTestApp();

  async function world() {
    clearTasteCache();
    const [maya, bob, carol, dave] = await Promise.all(['maya', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    await befriend(ctx.app, maya!, carol!);
    for (const p of ['s1', 's2', 's3', 'loved', 'disliked', 'allbeen', 'secret', 'meh']) ctx.places.add(p, `Place ${p}`);
    const rate = (u: TestUser, p: string, rating: number) => logVisit(ctx.app, u, p, { rating, recommends: rating >= 4 });
    // Shared history, so maya and bob have a taste match.
    for (const [p, r] of [['s1', 5], ['s2', 4], ['s3', 3]] as const) {
      await rate(maya!, p, r);
      await rate(bob!, p, r);
    }
    await rate(bob!, 'loved', 5); // maya hasn't been: a pick
    await rate(bob!, 'disliked', 5);
    await rate(maya!, 'disliked', 2); // vetoed
    await rate(bob!, 'allbeen', 5);
    await rate(maya!, 'allbeen', 4); // both have been
    await rate(bob!, 'meh', 3); // nobody loved it
    await as(ctx.app, bob!).post('/visits', { googlePlaceId: 'secret', visitedAt: '2026-10-01', audience: 'private', review: { rating: 5, recommends: true } });
    return { maya: maya!, bob: bob!, carol: carol!, dave: dave! };
  }

  it('suggests places someone loved, nobody disliked, and not everyone has tried', async () => {
    const w = await world();
    const res = (await as(ctx.app, w.maya).get(`/blend?with=${w.bob.id}`)).json() as Blend;
    // Five shared ratings, off by 0, 0, 0, 3 and 1 stars: 1 - 0.8/4 = 80%.
    expect(res.match).toBe(80);
    expect(res.participants.map((p) => p.username)).toEqual(['maya', 'bob']);
    expect(res.places.map((p) => [p.restaurant.name, p.lovedBy.map((l) => [l.user.username, l.rating]), p.newTo.map((u) => u.username)])).toEqual([
      ['Place loved', [['bob', 5]], ['maya']],
    ]);
  });

  it('only blends with friends, up to 5', async () => {
    const w = await world();
    expect((await as(ctx.app, w.maya).get(`/blend?with=${w.dave.id}`)).statusCode).toBe(403);
    // carol and bob aren't friends, but both are maya's, so maya can blend them.
    expect((await as(ctx.app, w.maya).get(`/blend?with=${w.bob.id},${w.carol.id}`)).statusCode).toBe(200);
    expect((await as(ctx.app, w.bob).get(`/blend?with=${w.carol.id}`)).statusCode).toBe(403);
    const six = Array.from({ length: 6 }, () => crypto.randomUUID()).join(',');
    expect((await as(ctx.app, w.maya).get(`/blend?with=${six}`)).statusCode).toBe(400);
  });
});
