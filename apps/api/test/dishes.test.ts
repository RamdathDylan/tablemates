import type { RestaurantDetail, Visit } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { dishKey } from '../src/lib/dishes';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('top dishes', () => {
  const ctx = setupTestApp();
  const review = (u: TestUser, dishes: unknown[], audience = 'friends') =>
    as(ctx.app, u).post('/visits', {
      googlePlaceId: 'luigi',
      visitedAt: '2026-10-01',
      audience,
      review: { rating: 5, recommends: true, dishes },
    });

  async function world() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('luigi', "Luigi's");
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave! };
  }

  it('stores rated and unrated dishes, accepting plain strings', async () => {
    const w = await world();
    const visit = (await review(w.alice, [{ name: 'Cacio e pepe', rating: 5 }, 'Tiramisu'])).json() as Visit;
    expect(visit.review!.dishes).toEqual([
      { name: 'Cacio e pepe', rating: 5 },
      { name: 'Tiramisu', rating: null },
    ]);
    const [mine] = (await as(ctx.app, w.alice).get('/me/visits')).json() as Visit[];
    expect(mine!.review!.dishes).toHaveLength(2);
  });

  it("ranks what friends order, grouping spellings and averaging stars", async () => {
    const w = await world();
    const { restaurant } = (await review(w.alice, [{ name: 'Cacio e pepe', rating: 5 }])).json();
    await review(w.bob, [{ name: 'Cacio e Pepe!', rating: 4 }, { name: 'Tiramisu', rating: 3 }]);
    await review(w.carol, ['cacio e pepe']);
    await review(w.dave, [{ name: 'Lasagna', rating: 5 }, { name: 'Lasagna', rating: 5 }]); // stranger

    const { topDishes } = (await as(ctx.app, w.alice).get(`/restaurants/${restaurant.id}`)).json() as RestaurantDetail;
    expect(topDishes.map((d) => [d.name, d.orders, d.averageRating, d.people.length])).toEqual([
      ['Cacio e pepe', 3, 4.5, 3],
      ['Tiramisu', 1, 3, 1],
    ]);
  });

  it("leaves out dishes from reviews the viewer can't see", async () => {
    const w = await world();
    const { restaurant } = (await review(w.bob, [{ name: 'Secret menu item', rating: 5 }], 'private')).json();
    const { topDishes } = (await as(ctx.app, w.alice).get(`/restaurants/${restaurant.id}`)).json() as RestaurantDetail;
    expect(topDishes).toEqual([]);
  });

  it('replaces dishes on edit, and keeps them when the edit is about something else', async () => {
    const w = await world();
    const visit = (await review(w.alice, ['Tiramisu'])).json() as Visit;
    const rated = (await as(ctx.app, w.alice).patch(`/reviews/${visit.review!.id}`, { rating: 3 })).json();
    expect(rated.dishes).toEqual([{ name: 'Tiramisu', rating: null }]);
    const changed = (await as(ctx.app, w.alice).patch(`/reviews/${visit.review!.id}`, { dishes: [{ name: 'Gelato', rating: 4 }] })).json();
    expect(changed.dishes).toEqual([{ name: 'Gelato', rating: 4 }]);
  });

  it('normalizes names for grouping', () => {
    expect(dishKey('  Crème Brûlée!! ')).toBe('creme brulee');
    expect(dishKey('Cacio  e   Pepe')).toBe('cacio e pepe');
  });
});
