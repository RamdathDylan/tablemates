import type { RestaurantList } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup } from './helpers';

describe('food crawls', () => {
  const ctx = setupTestApp();

  async function world() {
    const [maya, bob] = await Promise.all(['maya', 'bob'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    // Three stops about 1.1 km apart going north.
    const ids: Record<string, string> = {};
    for (const [i, p] of ['first', 'second', 'third'].entries()) {
      ctx.places.add(p, `Stop ${p}`, { lat: 40.7 + i * 0.01, lng: -74 });
      ids[p] = (await as(ctx.app, maya!).post('/visits', { googlePlaceId: p, visitedAt: '2026-10-01', audience: 'private' })).json().restaurant.id;
    }
    const crawl = (await as(ctx.app, maya!).post('/lists', { title: 'Pizza crawl', kind: 'crawl' })).json().id as string;
    for (const p of ['first', 'second', 'third']) await as(ctx.app, maya!).put(`/lists/${crawl}/items/${ids[p]}`);
    return { maya: maya!, bob: bob!, ids, crawl };
  }
  const get = async (u: Parameters<typeof as>[1], id: string) => (await as(ctx.app, u).get(`/lists/${id}`)).json() as RestaurantList;

  it('keeps stops in the order they were added, with distances between them', async () => {
    const w = await world();
    const crawl = await get(w.bob, w.crawl);
    expect(crawl.kind).toBe('crawl');
    expect(crawl.items.map((i) => i.restaurant.name)).toEqual(['Stop first', 'Stop second', 'Stop third']);
    expect(crawl.route).toEqual({ legsKm: [1.11, 1.11], totalKm: 2.22 });
  });

  it('reorders stops when given every stop exactly once', async () => {
    const w = await world();
    const order = [w.ids.third!, w.ids.first!, w.ids.second!];
    expect((await as(ctx.app, w.maya).put(`/lists/${w.crawl}/order`, { restaurantIds: order })).statusCode).toBe(204);
    const crawl = await get(w.maya, w.crawl);
    expect(crawl.items.map((i) => i.restaurant.name)).toEqual(['Stop third', 'Stop first', 'Stop second']);
    expect(crawl.route).toEqual({ legsKm: [2.22, 1.11], totalKm: 3.33 });

    expect((await as(ctx.app, w.maya).put(`/lists/${w.crawl}/order`, { restaurantIds: order.slice(1) })).statusCode).toBe(400);
    expect((await as(ctx.app, w.maya).put(`/lists/${w.crawl}/order`, { restaurantIds: [order[0], order[0], order[1]] })).statusCode).toBe(400);
    expect((await as(ctx.app, w.bob).put(`/lists/${w.crawl}/order`, { restaurantIds: order })).statusCode).toBe(403);
  });

  it('leaves plain lists unordered', async () => {
    const w = await world();
    const list = (await as(ctx.app, w.maya).post('/lists', { title: 'Plain' })).json().id as string;
    await as(ctx.app, w.maya).put(`/lists/${list}/items/${w.ids.first}`);
    expect((await get(w.maya, list)).route).toBeNull();
    expect((await as(ctx.app, w.maya).put(`/lists/${list}/order`, { restaurantIds: [w.ids.first] })).statusCode).toBe(400);
  });
});
