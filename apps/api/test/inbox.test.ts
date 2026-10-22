import type { NotificationItem } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('activity inbox', () => {
  const ctx = setupTestApp();
  const inbox = async (u: TestUser, q = '') =>
    (await as(ctx.app, u).get(`/notifications${q}`)).json() as Promise<{ items: NotificationItem[]; nextCursor: string | null }>;
  const types = async (u: TestUser) => (await inbox(u)).items.map((i) => i.type);

  it('shows an incoming friend request with its pending id, and replaces it once accepted', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();

    const [item] = (await inbox(bob)).items;
    expect(item).toMatchObject({ type: 'friend_request', read: false, pendingRequestId: requestId, actor: { username: 'alice' } });
    expect(await types(alice)).toEqual([]);

    await as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`);
    expect(await types(bob)).toEqual([]);
    expect(await types(alice)).toEqual(['friend_accepted']);
  });

  it('drops the request from the inbox when it is declined or cancelled', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    await as(ctx.app, alice).post(`/friends/requests/${requestId}/decline`);
    expect(await types(bob)).toEqual([]);
  });

  async function savedPlaceWorld() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('luigi', "Luigi's");
    // Dave (a stranger) logs first so the restaurant exists and everyone can save it.
    const { restaurant } = (await as(ctx.app, dave!).post('/visits', { googlePlaceId: 'luigi', visitedAt: '2026-10-01' })).json();
    for (const u of [bob!, carol!, dave!]) await as(ctx.app, u).put(`/restaurants/${restaurant.id}/save`);
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave! };
  }
  const review = (user: TestUser, audience: string) =>
    as(ctx.app, user).post('/visits', {
      googlePlaceId: 'luigi',
      visitedAt: '2026-10-02',
      audience,
      review: { rating: 5, recommends: true, body: 'So good' },
    });
  const savedAlerts = async (u: TestUser) => (await types(u)).filter((t) => t === 'saved_place_reviewed').length;

  it("tells friends who saved a place when you review it, but not strangers who saved it", async () => {
    const w = await savedPlaceWorld();
    await review(w.alice, 'friends');
    expect(await savedAlerts(w.bob)).toBe(1);
    expect(await savedAlerts(w.carol)).toBe(1);
    expect(await savedAlerts(w.dave)).toBe(0);
    const item = (await inbox(w.bob)).items.find((i) => i.type === 'saved_place_reviewed')!;
    expect(item.restaurant?.name).toBe("Luigi's");
    expect(item.reviewId).toBeTruthy();
  });

  it('respects the review audience: private tells nobody, close friends tells only them', async () => {
    const w = await savedPlaceWorld();
    await review(w.alice, 'private');
    expect(await savedAlerts(w.bob)).toBe(0);

    await as(ctx.app, w.alice).put(`/me/close-friends/${w.bob.id}`);
    await review(w.alice, 'close_friends');
    expect(await savedAlerts(w.bob)).toBe(1);
    expect(await savedAlerts(w.carol)).toBe(0);
  });

  it('counts unread for the bell and marks everything read', async () => {
    const w = await savedPlaceWorld();
    await review(w.alice, 'friends');
    const before = (await as(ctx.app, w.bob).get('/notifications/summary')).json();
    expect(before.unread).toBeGreaterThan(0);
    expect((await as(ctx.app, w.bob).post('/notifications/read-all')).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).get('/notifications/summary')).json().unread).toBe(0);
    expect((await inbox(w.bob)).items.every((i) => i.read)).toBe(true);
  });

  it('paginates newest first', async () => {
    const alice = await signup(ctx.app, 'alice');
    const others = await Promise.all(['bea', 'ben', 'bix'].map((n) => signup(ctx.app, n)));
    for (const o of others) await as(ctx.app, o).post('/friends/requests', { username: 'alice' });
    const first = await inbox(alice, '?limit=2');
    expect(first.items.map((i) => i.actor.username)).toEqual(['bix', 'ben']);
    const second = await inbox(alice, `?limit=2&cursor=${first.nextCursor}`);
    expect(second.items.map((i) => i.actor.username)).toEqual(['bea']);
    expect(second.nextCursor).toBeNull();
  });
});
