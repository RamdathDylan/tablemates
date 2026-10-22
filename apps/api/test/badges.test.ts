import type { Badge, NotificationItem } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('badges and passport', () => {
  const ctx = setupTestApp();
  const passport = async (viewer: TestUser, username: string) =>
    (await as(ctx.app, viewer).get(`/users/${username}/badges`)).json() as Badge[];
  const earned = async (u: TestUser) => (await passport(u, u.username)).filter((b) => b.earnedAt).map((b) => b.key).sort();
  const log = (u: TestUser, place: string, review?: { rating: number; recommends: boolean }) =>
    as(ctx.app, u).post('/visits', { googlePlaceId: place, visitedAt: '2026-10-01', review });

  it('awards place, cuisine, and neighborhood badges at their targets, with progress before that', async () => {
    const alice = await signup(ctx.app, 'alice');
    const cuisines = ['Italian', 'Japanese', 'Mexican', 'Thai', 'Indian', 'French', 'Greek', 'Korean', 'Ethiopian', 'Peruvian'];
    for (let i = 0; i < 10; i++) {
      ctx.places.add(`p${i}`, `Place ${i}`, { cuisine: [cuisines[i]!], neighborhood: `Hood ${i % 5}` });
      if (i === 4) {
        const mid = await passport(alice, 'alice');
        expect(mid.find((b) => b.key === 'places_10')!.progress).toEqual({ current: 4, target: 10 });
      }
      await log(alice, `p${i}`);
    }
    expect(await earned(alice)).toEqual(['cuisine_10', 'cuisine_5', 'neighborhoods_5', 'places_10']);
    expect((await passport(alice, 'alice')).find((b) => b.key === 'cuisine_25')!.progress).toEqual({ current: 10, target: 25 });
  });

  it('awards Regular after 5 visits to one place', async () => {
    const alice = await signup(ctx.app, 'alice');
    ctx.places.add('luigi', "Luigi's");
    for (let i = 0; i < 5; i++) await log(alice, 'luigi');
    expect(await earned(alice)).toContain('regular');
  });

  it("awards Trailblazer only when no friend reviewed the place first (strangers don't count)", async () => {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('first', 'First Spot');
    ctx.places.add('second', 'Second Spot');
    await log(dave!, 'first', { rating: 5, recommends: true }); // stranger got there first: doesn't matter
    await log(bob!, 'second', { rating: 4, recommends: true }); // a friend got there first
    await log(alice!, 'second', { rating: 4, recommends: true });
    expect(await earned(alice!)).not.toContain('trailblazer');
    await log(alice!, 'first', { rating: 5, recommends: true });
    expect(await earned(alice!)).toContain('trailblazer');
  });

  it('awards Tastemaker when friends save 10 places you recommended', async () => {
    const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ctx.places.add(`r${i}`, `Rec ${i}`);
      ids.push((await log(alice!, `r${i}`, { rating: 5, recommends: true })).json().restaurant.id);
    }
    for (const id of ids) await as(ctx.app, bob!).put(`/restaurants/${id}/save`);
    expect(await earned(alice!)).not.toContain('tastemaker');
    for (const id of ids) await as(ctx.app, carol!).put(`/restaurants/${id}/save`);
    expect(await earned(alice!)).toContain('tastemaker');
  });

  it('announces each badge once, and shows friends only earned badges', async () => {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('luigi', "Luigi's");
    for (let i = 0; i < 6; i++) await log(alice!, 'luigi');
    const inbox = (await as(ctx.app, alice!).get('/notifications')).json().items as NotificationItem[];
    expect(inbox.filter((n) => n.type === 'badge').map((n) => n.badge)).toEqual([{ key: 'regular', title: 'Regular' }]);

    const asFriend = await passport(bob!, 'alice');
    expect(asFriend.map((b) => b.key)).toEqual(['regular']);
    expect(asFriend[0]!.progress).toBeNull();
    expect((await as(ctx.app, dave!).get('/users/alice/badges')).statusCode).toBe(403);
  });
});
