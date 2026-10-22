import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { as, befriend, logVisit, setupTestApp, signup } from './helpers';

describe('friends-only visibility', () => {
  const ctx = setupTestApp();

  async function scenario() {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    ctx.places.add('place-1', 'Luigis');
    const visit = await logVisit(ctx.app, alice, 'place-1', {
      rating: 5,
      recommends: true,
      body: 'Get the cacio e pepe',
    });
    return { alice, bob, restaurantId: visit.restaurant.id as string };
  }

  it('hides reviews from non-friends everywhere', async () => {
    const { bob, restaurantId } = await scenario();
    const api = as(ctx.app, bob);

    expect((await api.get('/feed')).json().items).toEqual([]);

    const detail = (await api.get(`/restaurants/${restaurantId}`)).json();
    expect(detail.reviews).toEqual([]);
    expect(detail.friendStats).toEqual({ visits: 0, recommends: 0, averageRating: null });

    expect((await api.get('/users/alice/visits')).statusCode).toBe(403);

    const profile = (await api.get('/users/alice')).json();
    expect(profile.friendship).toBe('none');
    expect(profile.stats).toBeUndefined();
  });

  it('a pending request does not grant access', async () => {
    const { alice, bob } = await scenario();
    await as(ctx.app, bob).post('/friends/requests', { username: alice.username });
    expect((await as(ctx.app, bob).get('/feed')).json().items).toEqual([]);
    expect((await as(ctx.app, bob).get('/users/alice/visits')).statusCode).toBe(403);
  });

  it('shows reviews once friends, and hides them again after unfriending', async () => {
    const { alice, bob, restaurantId } = await scenario();
    await befriend(ctx.app, bob, alice);
    const api = as(ctx.app, bob);

    const feed = (await api.get('/feed')).json();
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].author.username).toBe('alice');
    expect(feed.items[0].review.body).toBe('Get the cacio e pepe');
    expect(feed.items[0].author).not.toHaveProperty('email');

    const detail = (await api.get(`/restaurants/${restaurantId}`)).json();
    expect(detail.reviews).toHaveLength(1);
    expect(detail.friendStats).toEqual({ visits: 1, recommends: 1, averageRating: 5 });
    expect((await api.get('/users/alice/visits')).json()).toHaveLength(1);
    expect((await api.get('/users/alice')).json().stats).toEqual({
      visits: 1,
      reviews: 1,
      friends: 1,
    });

    expect((await api.delete(`/friends/${alice.id}`)).statusCode).toBe(204);
    expect((await api.get('/feed')).json().items).toEqual([]);
    expect((await api.get(`/restaurants/${restaurantId}`)).json().reviews).toEqual([]);
    expect((await api.get('/users/alice/visits')).statusCode).toBe(403);
  });

  it("friends of friends don't see each other's reviews", async () => {
    const { alice, bob } = await scenario();
    const carol = await signup(ctx.app, 'carol');
    await befriend(ctx.app, alice, bob);
    await befriend(ctx.app, bob, carol);
    expect((await as(ctx.app, carol).get('/feed')).json().items).toEqual([]);
    expect((await as(ctx.app, alice).get('/feed')).json().items).toEqual([]);
  });

  it("shows your own review on restaurant detail but not in your feed", async () => {
    const { alice, restaurantId } = await scenario();
    const api = as(ctx.app, alice);
    expect((await api.get('/feed')).json().items).toEqual([]);
    expect((await api.get(`/restaurants/${restaurantId}`)).json().reviews).toHaveLength(1);
  });
});

describe('visibility rules live in one module', () => {
  const src = fileURLToPath(new URL('../src', import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const path = join(dir, f);
      return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
    });
  // Comparing a visit, story or check-in audience, or hand-writing the close-friends check.
  const patterns = [
    /\b(eq|ne|inArray)\(\s*(visits|stories|checkins)\.audience\b/,
    /\$\{(visits|stories|checkins)\.audience\}/,
    /\$\{closeFriends\.(ownerId|friendId)\}\s*=/,
  ];

  it('has no audience SQL outside lib/visibility.ts', () => {
    const offenders = files(src)
      .filter((f) => !f.endsWith(join('lib', 'visibility.ts')) && !f.endsWith(join('db', 'schema.ts')))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i, line }))
          .filter(({ line }) => patterns.some((p) => p.test(line)))
          .map(({ f, i, line }) => `${f.slice(src.length + 1)}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
