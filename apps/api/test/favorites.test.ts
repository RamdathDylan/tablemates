import type { Favorite, Profile } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('top 4 favorites', () => {
  const ctx = setupTestApp();

  async function upload(u: TestUser) {
    const { photoId, uploadUrl } = (await as(ctx.app, u).post('/uploads', { kind: 'review', contentType: 'image/jpeg', bytes: 10 })).json();
    ctx.storage.put(uploadUrl.replace('https://storage.test/put/', ''), 10);
    await as(ctx.app, u).post(`/photos/${photoId}/confirm`);
    return photoId as string;
  }

  async function world() {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    const ids: string[] = [];
    for (const p of ['a', 'b', 'c', 'd', 'e']) {
      ctx.places.add(p, `Place ${p.toUpperCase()}`);
      ids.push((await as(ctx.app, alice!).post('/visits', { googlePlaceId: p, visitedAt: '2026-10-01' })).json().restaurant.id);
    }
    return { alice: alice!, bob: bob!, dave: dave!, ids };
  }

  it('pins up to four visited places, in order', async () => {
    const w = await world();
    const res = await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: [w.ids[2], w.ids[0], w.ids[3]] });
    expect((res.json() as Favorite[]).map((f) => f.restaurant.name)).toEqual(['Place C', 'Place A', 'Place D']);
    expect((await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: w.ids })).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: [w.ids[0], w.ids[0]] })).statusCode).toBe(400);
  });

  it("won't pin places you haven't been", async () => {
    const w = await world();
    ctx.places.add('z', 'Never Been');
    const other = (await as(ctx.app, w.bob).post('/visits', { googlePlaceId: 'z', visitedAt: '2026-10-01' })).json().restaurant.id;
    expect((await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: [other] })).statusCode).toBe(400);
  });

  it('shows favorites to friends with a cover photo, and to nobody else', async () => {
    const w = await world();
    const photoId = await upload(w.alice);
    await as(ctx.app, w.alice).post('/visits', {
      googlePlaceId: 'a',
      visitedAt: '2026-10-05',
      review: { rating: 5, recommends: true, photoIds: [photoId] },
    });
    await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: [w.ids[0], w.ids[1]] });
    const seen = ((await as(ctx.app, w.bob).get('/users/alice')).json() as Profile).favorites!;
    expect(seen.map((f) => [f.restaurant.name, f.photo?.id ?? null])).toEqual([
      ['Place A', photoId],
      ['Place B', null],
    ]);
    expect(((await as(ctx.app, w.dave).get('/users/alice')).json() as Profile).favorites).toBeUndefined();
  });

  it("hides a cover photo from a review the viewer can't see", async () => {
    const w = await world();
    const photoId = await upload(w.alice);
    await as(ctx.app, w.alice).post('/visits', {
      googlePlaceId: 'a',
      visitedAt: '2026-10-05',
      audience: 'private',
      review: { rating: 5, recommends: true, photoIds: [photoId] },
    });
    await as(ctx.app, w.alice).put('/me/favorites', { restaurantIds: [w.ids[0]] });
    expect(((await as(ctx.app, w.bob).get('/users/alice')).json() as Profile).favorites![0]!.photo).toBeNull();
    expect(((await as(ctx.app, w.alice).get('/users/alice')).json() as Profile).favorites![0]!.photo?.id).toBe(photoId);
  });
});
