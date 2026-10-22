import type { MapPlace } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, logVisit, setupTestApp, signup } from './helpers';

describe('want-to-try list', () => {
  const ctx = setupTestApp();

  async function setup() {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await befriend(ctx.app, alice, bob);
    ctx.places.add('luigi', "Luigi's");
    ctx.places.add('sushi', 'Sushi Zen');
    const luigi = (await logVisit(ctx.app, bob, 'luigi', { rating: 5, recommends: true })).restaurant.id as string;
    // Bob also logs and then removes a visit, which leaves a known restaurant nobody has a visit at.
    const sushiVisit = await logVisit(ctx.app, bob, 'sushi');
    await as(ctx.app, bob).delete(`/visits/${sushiVisit.id}`);
    return { alice, bob, luigi, sushi: sushiVisit.restaurant.id as string };
  }

  it('saves and unsaves idempotently', async () => {
    const { alice, luigi } = await setup();
    const api = as(ctx.app, alice);
    expect((await api.put(`/restaurants/${luigi}/save`)).statusCode).toBe(204);
    expect((await api.put(`/restaurants/${luigi}/save`)).statusCode).toBe(204);
    expect((await api.get('/me/saved')).json().map((s: { restaurant: { name: string } }) => s.restaurant.name)).toEqual(["Luigi's"]);
    expect((await api.delete(`/restaurants/${luigi}/save`)).statusCode).toBe(204);
    expect((await api.delete(`/restaurants/${luigi}/save`)).statusCode).toBe(204);
    expect((await api.get('/me/saved')).json()).toEqual([]);
    expect((await api.put('/restaurants/00000000-0000-0000-0000-000000000000/save')).statusCode).toBe(404);
  });

  it('flags saved places on the feed and restaurant page, only for the saver', async () => {
    const { alice, bob, luigi } = await setup();
    await as(ctx.app, alice).put(`/restaurants/${luigi}/save`);
    expect((await as(ctx.app, alice).get('/feed')).json().items[0].saved).toBe(true);
    expect((await as(ctx.app, alice).get(`/restaurants/${luigi}`)).json().saved).toBe(true);
    // Saving is private: bob's view is unaffected and his list is empty.
    expect((await as(ctx.app, bob).get(`/restaurants/${luigi}`)).json().saved).toBe(false);
    expect((await as(ctx.app, bob).get('/me/saved')).json()).toEqual([]);
  });

  it('shows saved places on the map, including ones nobody has visited', async () => {
    const { alice, bob, luigi, sushi } = await setup();
    await as(ctx.app, alice).put(`/restaurants/${luigi}/save`);
    await as(ctx.app, alice).put(`/restaurants/${sushi}/save`);
    const map = async (q = '') => (await as(ctx.app, alice).get(`/map/places${q}`)).json() as Promise<MapPlace[]>;

    const all = await map();
    expect(all.map((p) => [p.restaurant.name, p.saved]).sort()).toEqual([
      ["Luigi's", true],
      ['Sushi Zen', true],
    ]);
    expect(all.find((p) => p.restaurant.name === 'Sushi Zen')!.summary.visits).toBe(0);
    expect((await map('?saved=true')).map((p) => p.restaurant.name).sort()).toEqual(["Luigi's", 'Sushi Zen']);
    // Friends-only views don't gain unvisited saved places.
    expect((await map('?scope=friends')).map((p) => p.restaurant.name)).toEqual(["Luigi's"]);
    // Recommended filter naturally drops places with no reviews.
    expect((await map('?recommended=true')).map((p) => p.restaurant.name)).toEqual(["Luigi's"]);
    // Bob never sees alice's saved list on his map.
    const bobs = (await as(ctx.app, bob).get('/map/places')).json() as MapPlace[];
    expect(bobs.every((p) => !p.saved)).toBe(true);
    expect(bobs.map((p) => p.restaurant.name)).toEqual(["Luigi's"]);
  });
});
