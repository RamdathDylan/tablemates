import type { FeedItem, NotificationItem, Page, PlanSummary, RestaurantList, TableDetail, TableSummary } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, logVisit, setupTestApp, signup, type TestUser } from './helpers';

describe('tables', () => {
  const ctx = setupTestApp();

  /**
   * alice seats bob and carol, who are her friends but not each other's.
   * dave is alice's friend but not at the table; eve is a stranger.
   */
  async function world() {
    const [alice, bob, carol, dave, eve] = await Promise.all(['alice', 'bob', 'carol', 'dave', 'eve'].map((n) => signup(ctx.app, n)));
    for (const f of [bob!, carol!, dave!]) await befriend(ctx.app, alice!, f);
    ctx.places.add('tacos', 'Taco Spot');
    ctx.places.add('ramen', 'Ramen Bar');
    const res = await as(ctx.app, alice!).post('/tables', { name: 'Taco Tuesday', emoji: '🌮', memberIds: [bob!.id, carol!.id] });
    expect(res.statusCode).toBe(201);
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, eve: eve!, table: res.json().id as string };
  }
  const get = (u: TestUser, path: string) => as(ctx.app, u).get(path);

  it("only seats the owner's friends", async () => {
    const w = await world();
    expect((await as(ctx.app, w.alice).post('/tables', { name: 'Nope', memberIds: [w.eve.id] })).statusCode).toBe(400);
    // bob can't seat carol: they aren't friends.
    expect((await as(ctx.app, w.bob).post('/tables', { name: 'Nope', memberIds: [w.carol.id] })).statusCode).toBe(400);
    const tables = (await get(w.bob, '/tables')).json() as TableSummary[];
    expect(tables.map((t) => [t.name, t.emoji, t.isOwner, t.members.map((m) => m.username)])).toEqual([
      ['Taco Tuesday', '🌮', false, ['alice', 'bob', 'carol']],
    ]);
  });

  it('tells new members, and hides the table from everyone else', async () => {
    const w = await world();
    const inbox = (await get(w.carol, '/notifications')).json() as Page<NotificationItem>;
    expect(inbox.items.map((n) => [n.type, n.actor.username, n.tableId, n.excerpt])).toEqual([
      ['table_invite', 'alice', w.table, '🌮 Taco Tuesday'],
    ]);
    for (const outsider of [w.dave, w.eve]) {
      expect((await get(outsider, `/tables/${w.table}`)).statusCode).toBe(404);
      expect((await get(outsider, `/tables/${w.table}/feed`)).statusCode).toBe(404);
      expect((await get(outsider, '/tables')).json()).toEqual([]);
    }
  });

  it("shows members' reviews in the table feed, still within each review's audience", async () => {
    const w = await world();
    await logVisit(ctx.app, w.bob, 'tacos', { rating: 5, recommends: true, body: 'Bob loved it' });
    await as(ctx.app, w.alice).post('/visits', {
      googlePlaceId: 'ramen',
      visitedAt: '2026-10-02',
      audience: 'private',
      review: { rating: 2, recommends: false, body: 'Alice private' },
    });
    // dave is alice's friend but not at the table: his reviews stay out of it.
    await logVisit(ctx.app, w.dave, 'ramen', { rating: 4, recommends: true, body: 'Dave outside' });

    const bodies = async (u: TestUser) =>
      ((await get(u, `/tables/${w.table}/feed`)).json() as Page<FeedItem>).items.map((i) => i.review.body);
    expect(await bodies(w.alice)).toEqual(['Alice private', 'Bob loved it']);
    expect(await bodies(w.bob)).toEqual(['Bob loved it']);
    // carol shares a table with bob but isn't his friend, so his friends-only review stays hidden.
    expect(await bodies(w.carol)).toEqual([]);
  });

  it('shares table lists with members only, and lets any member add places', async () => {
    const w = await world();
    const restaurantId = (await logVisit(ctx.app, w.carol, 'tacos')).restaurant.id;
    const listId = (await as(ctx.app, w.alice).post('/lists', { title: 'Next up', tableId: w.table })).json().id;
    expect((await as(ctx.app, w.carol).put(`/lists/${listId}/items/${restaurantId}`, { note: 'Try the birria' })).statusCode).toBe(204);

    const list = (await get(w.bob, `/lists/${listId}`)).json() as RestaurantList;
    expect(list).toMatchObject({ isOwner: false, canEdit: true, table: { id: w.table, name: 'Taco Tuesday' } });
    expect(list.items.map((i) => i.note)).toEqual(['Try the birria']);
    // Only the creator renames or deletes it.
    expect((await as(ctx.app, w.bob).delete(`/lists/${listId}`)).statusCode).toBe(403);

    // dave is alice's friend, but a table list isn't one of her shared lists.
    expect((await get(w.dave, `/lists/${listId}`)).statusCode).toBe(404);
    expect((await get(w.dave, '/users/alice/lists')).json()).toEqual([]);
    const mine = (await get(w.carol, '/me/lists')).json() as { mine: unknown[]; tables: { title: string }[] };
    expect([mine.mine, mine.tables.map((l) => l.title)]).toEqual([[], ['Next up']]);
    expect(((await get(w.dave, '/me/lists')).json() as { tables: unknown[] }).tables).toEqual([]);
    expect((await as(ctx.app, w.eve).post('/lists', { title: 'Sneaky', tableId: w.table })).statusCode).toBe(400);

    const detail = (await get(w.carol, `/tables/${w.table}`)).json() as TableDetail;
    expect(detail.lists.map((l) => [l.title, l.itemCount])).toEqual([['Next up', 1]]);

    // Leaving the table takes the list with it.
    await as(ctx.app, w.bob).delete(`/tables/${w.table}/members/${w.bob.id}`);
    expect((await get(w.bob, `/lists/${listId}`)).statusCode).toBe(404);
  });

  it('seats every member in a table plan, including members who are not friends', async () => {
    const w = await world();
    const res = await as(ctx.app, w.bob).post('/plans', { title: 'Friday dinner', tableId: w.table });
    expect(res.statusCode).toBe(201);
    const plans = (await get(w.carol, '/plans')).json() as PlanSummary[];
    expect(plans.map((p) => [p.title, p.members.map((m) => m.username)])).toEqual([['Friday dinner', ['alice', 'bob', 'carol']]]);
    const detail = (await get(w.alice, `/tables/${w.table}`)).json() as TableDetail;
    expect(detail.plans.map((p) => p.title)).toEqual(['Friday dinner']);
    // Outsiders can't use someone else's table to reach its members.
    expect((await as(ctx.app, w.dave).post('/plans', { title: 'Crash', tableId: w.table })).statusCode).toBe(404);
  });

  it('lets the owner add and remove people, members leave, and only the owner delete', async () => {
    const w = await world();
    expect((await as(ctx.app, w.bob).post(`/tables/${w.table}/members`, { userIds: [w.dave.id] })).statusCode).toBe(403);
    expect((await as(ctx.app, w.alice).post(`/tables/${w.table}/members`, { userIds: [w.eve.id] })).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).post(`/tables/${w.table}/members`, { userIds: [w.dave.id, w.bob.id] })).json()).toEqual({ added: 1 });

    expect((await as(ctx.app, w.bob).delete(`/tables/${w.table}/members/${w.carol.id}`)).statusCode).toBe(403);
    expect((await as(ctx.app, w.alice).delete(`/tables/${w.table}/members/${w.carol.id}`)).statusCode).toBe(204);
    expect((await get(w.carol, `/tables/${w.table}`)).statusCode).toBe(404);
    expect((await as(ctx.app, w.alice).delete(`/tables/${w.table}/members/${w.alice.id}`)).statusCode).toBe(400);

    expect((await as(ctx.app, w.bob).delete(`/tables/${w.table}`)).statusCode).toBe(403);
    expect((await as(ctx.app, w.alice).delete(`/tables/${w.table}`)).statusCode).toBe(204);
    expect((await get(w.bob, '/tables')).json()).toEqual([]);
  });
});
