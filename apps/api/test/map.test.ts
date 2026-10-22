import type { MapPlace } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, logVisit, setupTestApp, signup, type TestUser } from './helpers';

describe('map places', () => {
  const ctx = setupTestApp();
  const places = async (user: TestUser, query = '') =>
    (await as(ctx.app, user).get(`/map/places${query}`)).json() as Promise<MapPlace[]>;
  const names = (ps: MapPlace[]) => ps.map((p) => p.restaurant.name);

  /**
   * alice (viewer) is friends with bob and carol. dave is a stranger; erin has a
   * pending request with alice.
   */
  async function world() {
    const [alice, bob, carol, dave, erin] = await Promise.all(
      ['alice', 'bob', 'carol', 'dave', 'erin'].map((n) => signup(ctx.app, n)),
    );
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    await as(ctx.app, erin!).post('/friends/requests', { username: 'alice' });

    ctx.places.add('luigi', "Luigi's", { lat: 40.72, lng: -74.0, cuisine: ['Italian'] });
    ctx.places.add('sushi', 'Sushi Zen', { lat: 40.76, lng: -73.98, cuisine: ['Japanese', 'Sushi'] });
    ctx.places.add('taco', 'Taco Town', { lat: 40.69, lng: -73.99, cuisine: ['Mexican'] });
    ctx.places.add('secret', 'Strangers Only', { lat: 40.7, lng: -74.01 });

    await logVisit(ctx.app, alice!, 'luigi', { rating: 4, recommends: true, body: 'Solid' }, '2026-09-01');
    await logVisit(ctx.app, bob!, 'luigi', { rating: 5, recommends: true, body: 'Best pasta' }, '2026-10-05');
    await logVisit(ctx.app, carol!, 'luigi', { rating: 3, recommends: false }, '2026-10-01');
    await logVisit(ctx.app, bob!, 'sushi', { rating: 5, recommends: true, body: 'Omakase!' }, '2026-10-10');
    await logVisit(ctx.app, carol!, 'taco'); // no review
    await logVisit(ctx.app, dave!, 'secret', { rating: 5, recommends: true });
    await logVisit(ctx.app, dave!, 'luigi', { rating: 1, recommends: false, body: 'Awful' });
    await logVisit(ctx.app, erin!, 'secret', { rating: 5, recommends: true });
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, erin: erin! };
  }

  it("shows the viewer's and friends' places, never strangers' or pending requests'", async () => {
    const { alice } = await world();
    const all = await places(alice);
    expect(names(all).sort()).toEqual(["Luigi's", 'Sushi Zen', 'Taco Town']);
    const luigi = all.find((p) => p.restaurant.name === "Luigi's")!;
    // Dave's 1-star visit to Luigi's must not leak into any number.
    expect(luigi.summary).toEqual({ visits: 3, recommends: 2, averageRating: 4, lastVisitedAt: '2026-10-05' });
    expect(luigi.latestReview?.body).toBe('Best pasta');
    expect(JSON.stringify(all)).not.toContain('Awful');
  });

  it("splits the viewer's own visit from friends' visits", async () => {
    const { alice } = await world();
    const luigi = (await places(alice)).find((p) => p.restaurant.name === "Luigi's")!;
    expect(luigi.me).toEqual({ visits: 1, rating: 4, recommends: true, lastVisitedAt: '2026-09-01' });
    expect(luigi.friends).toMatchObject({ count: 2, visits: 2, recommends: 1, averageRating: 4 });
    expect(luigi.friends.visitors.map((v) => [v.user.username, v.rating])).toEqual([
      ['bob', 5],
      ['carol', 3],
    ]);
    expect(luigi.friends.visitors[0]!.user).not.toHaveProperty('email');
  });

  it('filters by scope', async () => {
    const { alice, bob } = await world();
    expect(names(await places(alice, '?scope=me'))).toEqual(["Luigi's"]);
    expect(names(await places(alice, '?scope=friends')).sort()).toEqual(["Luigi's", 'Sushi Zen', 'Taco Town']);
    const onlyBob = await places(alice, `?scope=friend&friendId=${bob.id}`);
    expect(names(onlyBob).sort()).toEqual(["Luigi's", 'Sushi Zen']);
    expect(onlyBob.every((p) => p.me === null)).toBe(true);
  });

  it("refuses to filter by someone who isn't a friend", async () => {
    const { alice, dave, erin } = await world();
    expect((await as(ctx.app, alice).get(`/map/places?scope=friend&friendId=${dave.id}`)).statusCode).toBe(403);
    expect((await as(ctx.app, alice).get(`/map/places?scope=friend&friendId=${erin.id}`)).statusCode).toBe(403);
    expect((await as(ctx.app, alice).get(`/map/places?scope=friend&friendId=${alice.id}`)).statusCode).toBe(403);
    expect((await as(ctx.app, alice).get('/map/places?scope=friend')).statusCode).toBe(400);
  });

  it('filters by recommended, minimum rating, and cuisine', async () => {
    const { alice } = await world();
    expect(names(await places(alice, '?recommended=true')).sort()).toEqual(["Luigi's", 'Sushi Zen']);
    expect(names(await places(alice, '?minRating=5'))).toEqual(['Sushi Zen']);
    expect(names(await places(alice, '?cuisine=sushi'))).toEqual(['Sushi Zen']);
  });

  it('sorts by most recommended, rating, recency, and distance', async () => {
    const { alice } = await world();
    expect(names(await places(alice, '?sort=recommended'))).toEqual(["Luigi's", 'Sushi Zen', 'Taco Town']);
    expect(names(await places(alice, '?sort=rating'))).toEqual(['Sushi Zen', "Luigi's", 'Taco Town']);
    expect(names(await places(alice, '?sort=recent'))[0]).toBe('Sushi Zen');
    // Standing right next to Taco Town.
    const near = await places(alice, '?sort=distance&lat=40.69&lng=-73.99');
    expect(names(near)[0]).toBe('Taco Town');
    expect(near[0]!.distanceKm).toBe(0);
    expect((await as(ctx.app, alice).get('/map/places?sort=distance')).statusCode).toBe(400);
  });

  it('a stranger sees none of alice\'s places', async () => {
    const { dave } = await world();
    expect(names(await places(dave)).sort()).toEqual(["Luigi's", 'Strangers Only']);
    const luigi = (await places(dave)).find((p) => p.restaurant.name === "Luigi's")!;
    expect(luigi.summary.visits).toBe(1);
    expect(luigi.friends.count).toBe(0);
  });
});
