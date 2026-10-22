import { describe, expect, it } from 'vitest';

import { cuisineFromTypes } from '../src/places/google';
import { as, befriend, logVisit, setupTestApp, signup } from './helpers';

describe('visits and reviews', () => {
  const ctx = setupTestApp();

  it('creates a restaurant once per Google place', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    ctx.places.add('place-1', 'Luigis');
    const a = await logVisit(ctx.app, alice, 'place-1');
    const b = await logVisit(ctx.app, bob, 'place-1', { rating: 4, recommends: true });
    const again = await logVisit(ctx.app, alice, 'place-1');
    expect(b.restaurant.id).toBe(a.restaurant.id);
    expect(again.restaurant.id).toBe(a.restaurant.id);
    expect(ctx.places.getCalls).toBe(1);
    expect((await as(ctx.app, alice).get('/me/visits')).json()).toHaveLength(2);
  });

  it('404s for an unknown place', async () => {
    const alice = await signup(ctx.app, 'alice');
    const res = await as(ctx.app, alice).post('/visits', { googlePlaceId: 'nope', visitedAt: '2026-10-01' });
    expect(res.statusCode).toBe(404);
  });

  it('only lets the author edit or delete a review', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await befriend(ctx.app, alice, bob);
    ctx.places.add('place-1', 'Luigis');
    const visit = await logVisit(ctx.app, alice, 'place-1', { rating: 3, recommends: false });

    expect((await as(ctx.app, bob).patch(`/reviews/${visit.review.id}`, { rating: 1 })).statusCode).toBe(404);
    expect((await as(ctx.app, bob).delete(`/reviews/${visit.review.id}`)).statusCode).toBe(404);
    expect((await as(ctx.app, bob).delete(`/visits/${visit.id}`)).statusCode).toBe(404);

    const updated = await as(ctx.app, alice).patch(`/reviews/${visit.review.id}`, { rating: 5, recommends: true });
    expect(updated.json()).toMatchObject({ rating: 5, recommends: true });
  });

  it('adds a review to a visit logged without one, once', async () => {
    const alice = await signup(ctx.app, 'alice');
    ctx.places.add('place-1', 'Luigis');
    const visit = await logVisit(ctx.app, alice, 'place-1');
    const review = { rating: 4, recommends: true, dishes: ['Tiramisu'] };
    expect((await as(ctx.app, alice).post(`/visits/${visit.id}/review`, review)).statusCode).toBe(201);
    expect((await as(ctx.app, alice).post(`/visits/${visit.id}/review`, review)).statusCode).toBe(409);
  });

  it('paginates the feed with a cursor', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await befriend(ctx.app, alice, bob);
    for (let i = 0; i < 5; i++) {
      ctx.places.add(`place-${i}`, `Spot ${i}`);
      await logVisit(ctx.app, alice, `place-${i}`, { rating: 4, recommends: true });
    }
    const api = as(ctx.app, bob);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: { restaurant: { name: string } }[]; nextCursor: string | null } = (
        await api.get(`/feed?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      ).json();
      seen.push(...page.items.map((i) => i.restaurant.name));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['Spot 4', 'Spot 3', 'Spot 2', 'Spot 1', 'Spot 0']);
  });

  it('maps Google place types to cuisines', () => {
    expect(cuisineFromTypes(['restaurant', 'italian_restaurant', 'fast_food_restaurant', 'food'])).toEqual([
      'Italian',
    ]);
    expect(cuisineFromTypes(['middle_eastern_restaurant'])).toEqual(['Middle Eastern']);
  });
});
