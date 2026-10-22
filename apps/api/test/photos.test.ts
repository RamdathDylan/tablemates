import type { FeedItem, RestaurantDetail } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { cleanUpPendingPhotos } from '../src/lib/photos';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('photos', () => {
  const ctx = setupTestApp();

  /** Runs the real flow: request an upload, "upload" to fake storage, confirm. */
  async function upload(u: TestUser, kind = 'review', bytes = 1000) {
    const res = await as(ctx.app, u).post('/uploads', { kind, contentType: 'image/jpeg', bytes });
    expect(res.statusCode).toBe(201);
    const { photoId, uploadUrl } = res.json();
    ctx.storage.put(uploadUrl.replace('https://storage.test/put/', ''), bytes);
    expect((await as(ctx.app, u).post(`/photos/${photoId}/confirm`, { width: 1600, height: 1200 })).statusCode).toBe(200);
    return photoId as string;
  }

  it('rejects unsupported types and oversize files up front', async () => {
    const alice = await signup(ctx.app, 'alice');
    expect((await as(ctx.app, alice).post('/uploads', { kind: 'review', contentType: 'image/gif', bytes: 10 })).statusCode).toBe(400);
    expect((await as(ctx.app, alice).post('/uploads', { kind: 'review', contentType: 'image/jpeg', bytes: 9 * 1024 * 1024 })).statusCode).toBe(400);
  });

  it("won't confirm an upload that never arrived, or someone else's", async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { photoId } = (await as(ctx.app, alice).post('/uploads', { kind: 'review', contentType: 'image/jpeg', bytes: 10 })).json();
    expect((await as(ctx.app, alice).post(`/photos/${photoId}/confirm`)).statusCode).toBe(400);
    expect((await as(ctx.app, bob).post(`/photos/${photoId}/confirm`)).statusCode).toBe(404);
  });

  it("attaches photos to reviews; friends get signed URLs; others can't use them", async () => {
    const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('luigi', "Luigi's");
    const photoId = await upload(alice!);

    // Bob can't attach alice's photo to his own review.
    const stolen = await as(ctx.app, bob!).post('/visits', {
      googlePlaceId: 'luigi',
      visitedAt: '2026-10-01',
      review: { rating: 5, recommends: true, photoIds: [photoId] },
    });
    expect(stolen.statusCode).toBe(400);

    const visit = (
      await as(ctx.app, alice!).post('/visits', {
        googlePlaceId: 'luigi',
        visitedAt: '2026-10-01',
        review: { rating: 5, recommends: true, photoIds: [photoId] },
      })
    ).json();
    expect(visit.review.photos).toEqual([{ id: photoId, url: expect.stringContaining('?sig='), width: 1600, height: 1200 }]);

    const feed = (await as(ctx.app, bob!).get('/feed')).json().items as FeedItem[];
    expect(feed[0]!.review.photos[0]!.url).toContain('?sig=');
    const detail = (await as(ctx.app, bob!).get(`/restaurants/${visit.restaurant.id}`)).json() as RestaurantDetail;
    expect(detail.photos.map((p) => [p.id, p.author.username])).toEqual([[photoId, 'alice']]);
    // A stranger sees the restaurant but none of alice's photos.
    expect(((await as(ctx.app, carol!).get(`/restaurants/${visit.restaurant.id}`)).json() as RestaurantDetail).photos).toEqual([]);
  });

  it("keeps a private review's photos out of everyone else's view", async () => {
    const [alice, bob] = await Promise.all(['alice', 'bob'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('luigi', "Luigi's");
    const photoId = await upload(alice!);
    const visit = (
      await as(ctx.app, alice!).post('/visits', {
        googlePlaceId: 'luigi',
        visitedAt: '2026-10-01',
        audience: 'private',
        review: { rating: 5, recommends: true, photoIds: [photoId] },
      })
    ).json();
    const detail = (await as(ctx.app, bob!).get(`/restaurants/${visit.restaurant.id}`)).json() as RestaurantDetail;
    expect(JSON.stringify(detail)).not.toContain(photoId);
  });

  it('sets an uploaded avatar, served through a public redirect', async () => {
    const alice = await signup(ctx.app, 'alice');
    const photoId = await upload(alice, 'avatar');
    const me = (await as(ctx.app, alice).patch('/me', { avatarPhotoId: photoId })).json();
    expect(me.avatarUrl).toBe(`http://api.test/avatars/${photoId}`);
    const res = await ctx.app.inject({ url: `/avatars/${photoId}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('https://storage.test/get/avatar/');
    // A review photo can't be used as an avatar.
    const reviewPhoto = await upload(alice, 'review');
    expect((await as(ctx.app, alice).patch('/me', { avatarPhotoId: reviewPhoto })).statusCode).toBe(400);
    expect((await ctx.app.inject({ url: `/avatars/${reviewPhoto}` })).statusCode).toBe(404);
  });

  it('cleans up uploads that were never confirmed', async () => {
    const alice = await signup(ctx.app, 'alice');
    const { uploadUrl } = (await as(ctx.app, alice).post('/uploads', { kind: 'review', contentType: 'image/jpeg', bytes: 10 })).json();
    const key = uploadUrl.replace('https://storage.test/put/', '');
    ctx.storage.put(key, 10);
    const kept = await upload(alice);
    await ctx.db.execute(sql`update photos set created_at = now() - interval '2 days'`);
    expect(await cleanUpPendingPhotos(ctx.db, ctx.storage)).toBe(1);
    expect(ctx.storage.objects.has(key)).toBe(false);
    const left = await ctx.db.execute(sql`select id from photos`);
    expect([...left].map((r) => (r as { id: string }).id)).toEqual([kept]);
  });
});
