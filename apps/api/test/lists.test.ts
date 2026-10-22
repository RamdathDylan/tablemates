import type { ListSummary, MapPlace, RestaurantList } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('shareable lists', () => {
  const ctx = setupTestApp();

  /** alice curates; bob is her friend; dave is a stranger. */
  async function world() {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('tacos', 'Taco Spot');
    ctx.places.add('date', 'Candlelight');
    // Logging creates the restaurant rows; alice keeps her visits private.
    const ids: Record<string, string> = {};
    for (const p of ['tacos', 'date']) {
      ids[p] = (await as(ctx.app, alice!).post('/visits', { googlePlaceId: p, visitedAt: '2026-10-01', audience: 'private' })).json().restaurant.id;
    }
    const make = async (title: string, audience: string) =>
      (await as(ctx.app, alice!).post('/lists', { title, audience })).json().id as string;
    const shared = await make('Best tacos', 'friends');
    const secret = await make('Secret spots', 'private');
    await as(ctx.app, alice!).put(`/lists/${shared}/items/${ids.tacos}`, { note: 'Al pastor' });
    await as(ctx.app, alice!).put(`/lists/${secret}/items/${ids.date}`);
    return { alice: alice!, bob: bob!, dave: dave!, shared, secret, ids };
  }
  const get = (u: TestUser, path: string) => as(ctx.app, u).get(path);

  it("shows friends a friend's shared lists, never private ones, and strangers nothing", async () => {
    const w = await world();
    const bobSees = (await get(w.bob, '/users/alice/lists')).json() as ListSummary[];
    expect(bobSees.map((l) => [l.title, l.itemCount, l.preview])).toEqual([['Best tacos', 1, ['Taco Spot']]]);
    expect((await get(w.bob, `/lists/${w.secret}`)).statusCode).toBe(404);
    expect((await get(w.dave, '/users/alice/lists')).statusCode).toBe(403);
    expect((await get(w.dave, `/lists/${w.shared}`)).statusCode).toBe(404);
    expect(((await get(w.alice, '/users/alice/lists')).json() as ListSummary[])).toHaveLength(2);
  });

  it('returns a list with notes and the viewer\'s saved flags', async () => {
    const w = await world();
    const list = (await get(w.bob, `/lists/${w.shared}`)).json() as RestaurantList;
    expect(list).toMatchObject({ title: 'Best tacos', isOwner: false, following: false, owner: { username: 'alice' } });
    expect(list.items.map((i) => [i.restaurant.name, i.note, i.saved])).toEqual([['Taco Spot', 'Al pastor', false]]);
  });

  it('only lets the owner edit, add, remove, or delete', async () => {
    const w = await world();
    expect((await as(ctx.app, w.bob).patch(`/lists/${w.shared}`, { title: 'Mine now' })).statusCode).toBe(403);
    expect((await as(ctx.app, w.bob).put(`/lists/${w.shared}/items/${w.ids.date}`)).statusCode).toBe(403);
    expect((await as(ctx.app, w.bob).delete(`/lists/${w.shared}`)).statusCode).toBe(403);
    // Re-adding an item updates its note instead of duplicating it.
    await as(ctx.app, w.alice).put(`/lists/${w.shared}/items/${w.ids.tacos}`, { note: 'Ask for extra salsa' });
    const list = (await get(w.alice, `/lists/${w.shared}`)).json() as RestaurantList;
    expect(list.items.map((i) => i.note)).toEqual(['Ask for extra salsa']);
    expect((await as(ctx.app, w.alice).delete(`/lists/${w.shared}/items/${w.ids.tacos}`)).statusCode).toBe(204);
  });

  it('lets friends follow a list, and drops it from their view if it goes private', async () => {
    const w = await world();
    expect((await as(ctx.app, w.bob).put(`/lists/${w.shared}/follow`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.alice).put(`/lists/${w.shared}/follow`)).statusCode).toBe(403);
    expect(((await get(w.bob, '/me/lists')).json().following as ListSummary[]).map((l) => l.title)).toEqual(['Best tacos']);

    await as(ctx.app, w.alice).patch(`/lists/${w.shared}`, { audience: 'private' });
    expect((await get(w.bob, '/me/lists')).json().following).toEqual([]);
    expect((await get(w.bob, `/lists/${w.shared}`)).statusCode).toBe(404);
  });

  it('copies a whole list into your want-to-try list', async () => {
    const w = await world();
    await as(ctx.app, w.alice).put(`/lists/${w.shared}/items/${w.ids.date}`);
    expect((await as(ctx.app, w.bob).post(`/lists/${w.shared}/save-all`)).json()).toEqual({ added: 2 });
    expect((await as(ctx.app, w.bob).post(`/lists/${w.shared}/save-all`)).json()).toEqual({ added: 0 });
    expect((await get(w.bob, '/me/saved')).json()).toHaveLength(2);
  });

  it("filters the map to a list, including places nobody you know has visited", async () => {
    const w = await world();
    // Bob can't see alice's private visits, but the list still puts Taco Spot on his map.
    const places = (await get(w.bob, `/map/places?listId=${w.shared}`)).json() as MapPlace[];
    expect(places.map((p) => [p.restaurant.name, p.summary.visits])).toEqual([['Taco Spot', 0]]);
    expect((await get(w.bob, `/map/places?listId=${w.secret}`)).statusCode).toBe(404);
  });
});
