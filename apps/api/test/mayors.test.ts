import type { MapPlace, NotificationItem, Page, Profile, RestaurantDetail } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('mayors', () => {
  const ctx = setupTestApp();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  /** maya and bob are friends; dave is a stranger to both. */
  async function world() {
    const [maya, bob, dave] = await Promise.all(['maya', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    ctx.places.add('joes', "Joe's Pizza");
    const log = async (u: TestUser, ago: number, audience = 'friends') => {
      const res = await as(ctx.app, u).post('/visits', { googlePlaceId: 'joes', visitedAt: daysAgo(ago), audience });
      return res.json().restaurant.id as string;
    };
    return { maya: maya!, bob: bob!, dave: dave!, log };
  }
  const mayorOf = async (u: TestUser, id: string) => ((await as(ctx.app, u).get(`/restaurants/${id}`)).json() as RestaurantDetail).mayor;
  const crownAlerts = async (u: TestUser) =>
    ((await as(ctx.app, u).get('/notifications')).json() as Page<NotificationItem>).items.filter((n) => n.type === 'mayor_lost');

  it('needs 2 visits in the last 60 days, and breaks ties by who got there first', async () => {
    const w = await world();
    const id = await w.log(w.bob, 90); // too old to count
    await w.log(w.bob, 10);
    expect(await mayorOf(w.maya, id)).toBeNull();
    await w.log(w.bob, 5);
    await w.log(w.maya, 4);
    await w.log(w.maya, 2);
    // Tied at 2: bob reached 2 first.
    expect(await mayorOf(w.maya, id)).toMatchObject({ user: { username: 'bob' }, visits: 2 });
    await w.log(w.maya, 1);
    expect(await mayorOf(w.bob, id)).toMatchObject({ user: { username: 'maya' }, visits: 3 });
  });

  it("never counts strangers' visits", async () => {
    const w = await world();
    let id = '';
    for (const ago of [1, 2, 3, 4]) id = await w.log(w.dave, ago);
    await w.log(w.maya, 5);
    await w.log(w.maya, 6);
    expect(await mayorOf(w.maya, id)).toMatchObject({ user: { username: 'maya' } });
    expect(await mayorOf(w.dave, id)).toMatchObject({ user: { username: 'dave' }, visits: 4 });
  });

  it('tells a friend when you take their crown, but private visits never do', async () => {
    const w = await world();
    const id = await w.log(w.bob, 10);
    await w.log(w.bob, 9);
    await w.log(w.maya, 8, 'private');
    await w.log(w.maya, 7, 'private');
    await w.log(w.maya, 6, 'private');
    expect(await crownAlerts(w.bob)).toEqual([]);
    expect(await mayorOf(w.bob, id)).toMatchObject({ user: { username: 'bob' } });

    await w.log(w.maya, 5);
    await w.log(w.maya, 4);
    await w.log(w.maya, 3);
    expect((await crownAlerts(w.bob)).map((n) => [n.actor.username, n.restaurant?.name])).toEqual([['maya', "Joe's Pizza"]]);
  });

  it('shows on profiles and map pins', async () => {
    const w = await world();
    const id = await w.log(w.maya, 3);
    await w.log(w.maya, 2);
    expect(((await as(ctx.app, w.bob).get('/users/maya')).json() as Profile).mayorOf).toBe(1);
    expect(((await as(ctx.app, w.bob).get('/users/bob')).json() as Profile).mayorOf).toBe(0);
    const pins = (await as(ctx.app, w.bob).get('/map/places')).json() as MapPlace[];
    expect(pins.find((p) => p.restaurant.id === id)?.mayor?.username).toBe('maya');
  });
});
