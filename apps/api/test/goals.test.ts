import type { Goal, NotificationItem, Page, Profile, Wrapped } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('yearly goals', () => {
  const ctx = setupTestApp();
  const Y = new Date().getUTCFullYear();

  /** alice logs a mix of new and repeat places; bob is her friend; dave a stranger. */
  async function world() {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    for (const p of ['a', 'b', 'c', 'd', 'e']) ctx.places.add(p, `Place ${p.toUpperCase()}`);
    const log = (place: string, visitedAt: string, audience = 'friends') =>
      as(ctx.app, alice!).post('/visits', { googlePlaceId: place, visitedAt, audience });
    await log('a', `${Y - 1}-05-01`); // first visited last year
    await log('a', `${Y}-02-01`); // so this repeat isn't new
    await log('b', `${Y}-03-01`);
    await log('c', `${Y}-04-01`, 'private');
    return { alice: alice!, bob: bob!, dave: dave!, log };
  }
  const goalAlerts = async (u: TestUser) =>
    ((await as(ctx.app, u).get('/notifications')).json() as Page<NotificationItem>).items.filter((n) => n.type === 'goal_reached');

  it('counts places first visited this year, and celebrates reaching the goal once', async () => {
    const w = await world();
    const set = await as(ctx.app, w.alice).put(`/me/goals/${Y}`, { target: 3 });
    expect(set.json()).toEqual({ year: Y, target: 3, done: 2 } satisfies Goal);
    expect(await goalAlerts(w.alice)).toEqual([]);

    await w.log('d', `${Y}-05-01`);
    await w.log('e', `${Y}-06-01`);
    expect((await goalAlerts(w.alice)).map((n) => [n.type, n.count])).toEqual([['goal_reached', 3]]);

    // Raising the target makes it reachable again.
    await as(ctx.app, w.alice).put(`/me/goals/${Y}`, { target: 5 });
    expect(((await as(ctx.app, w.alice).get('/users/alice')).json() as Profile).goal).toEqual({ year: Y, target: 5, done: 4 });
  });

  it("shows friends the goal with only the visits they can see, and strangers nothing", async () => {
    const w = await world();
    await as(ctx.app, w.alice).put(`/me/goals/${Y}`, { target: 10 });
    expect(((await as(ctx.app, w.bob).get('/users/alice')).json() as Profile).goal).toEqual({ year: Y, target: 10, done: 1 });
    expect(((await as(ctx.app, w.dave).get('/users/alice')).json() as Profile).goal).toBeUndefined();
    expect(((await as(ctx.app, w.bob).get('/users/bob')).json() as Profile).goal).toBeNull();
  });

  it('only allows this year or next, sensible targets, and shows up in the year in review', async () => {
    const w = await world();
    expect((await as(ctx.app, w.alice).put(`/me/goals/${Y - 1}`, { target: 5 })).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).put(`/me/goals/${Y + 1}`, { target: 0 })).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).put(`/me/goals/${Y + 1}`, { target: 12 })).statusCode).toBe(200);
    await as(ctx.app, w.alice).put(`/me/goals/${Y}`, { target: 8 });
    expect(((await as(ctx.app, w.alice).get(`/me/wrapped?year=${Y}`)).json() as Wrapped).goal).toEqual({ year: Y, target: 8, done: 2 });
    expect((await as(ctx.app, w.alice).delete(`/me/goals/${Y}`)).statusCode).toBe(204);
    expect(((await as(ctx.app, w.alice).get('/users/alice')).json() as Profile).goal).toBeNull();
  });
});
