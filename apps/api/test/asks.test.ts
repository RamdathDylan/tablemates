import type { Ask, NotificationItem } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('ask your friends', () => {
  const ctx = setupTestApp();
  const asksOf = async (u: TestUser) => (await as(ctx.app, u).get('/asks')).json() as Ask[];

  /** alice asks; bob and carol are her friends; dave is a stranger. */
  async function world() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('ramen', 'Ramen Ya');
    ctx.places.add('noodle', 'Noodle Bar');
    const { id } = (await as(ctx.app, alice!).post('/asks', { question: 'Best ramen near Union Square?', areaLabel: 'Union Square' })).json();
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, askId: id as string };
  }

  it("shows a friend's ask to friends and the author, never to strangers", async () => {
    const w = await world();
    expect((await asksOf(w.bob)).map((a) => a.question)).toEqual(['Best ramen near Union Square?']);
    expect((await asksOf(w.alice))[0]).toMatchObject({ areaLabel: 'Union Square', open: true, replies: [] });
    expect(await asksOf(w.dave)).toEqual([]);
    expect((await as(ctx.app, w.dave).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' })).statusCode).toBe(404);
  });

  it("collects friends' suggestions with their own ratings, and notifies the asker", async () => {
    const w = await world();
    await as(ctx.app, w.bob).post('/visits', {
      googlePlaceId: 'ramen',
      visitedAt: '2026-10-01',
      review: { rating: 5, recommends: true },
    });
    expect((await as(ctx.app, w.bob).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen', note: 'Get the spicy miso' })).statusCode).toBe(201);
    expect((await as(ctx.app, w.carol).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'noodle' })).statusCode).toBe(201);

    const [ask] = await asksOf(w.alice);
    expect(ask!.replies.map((r) => [r.author.username, r.restaurant.name, r.rating, r.note])).toEqual([
      ['bob', 'Ramen Ya', 5, 'Get the spicy miso'],
      ['carol', 'Noodle Bar', null, ''],
    ]);
    const inbox = (await as(ctx.app, w.alice).get('/notifications')).json().items as NotificationItem[];
    expect(inbox.filter((n) => n.type === 'ask_reply').map((n) => [n.actor.username, n.excerpt])).toEqual([
      ['carol', 'Best ramen near Union Square?'],
      ['bob', 'Best ramen near Union Square?'],
    ]);
  });

  it("hides a replier's rating when the viewer can't see that review", async () => {
    const w = await world();
    await as(ctx.app, w.bob).post('/visits', {
      googlePlaceId: 'ramen',
      visitedAt: '2026-10-01',
      audience: 'private',
      review: { rating: 2, recommends: false },
    });
    await as(ctx.app, w.bob).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' });
    expect((await asksOf(w.alice))[0]!.replies[0]!.rating).toBeNull();
  });

  it('rejects duplicates, self-answers, and replies to closed asks', async () => {
    const w = await world();
    await as(ctx.app, w.bob).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' });
    expect((await as(ctx.app, w.bob).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' })).statusCode).toBe(409);
    expect((await as(ctx.app, w.alice).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' })).statusCode).toBe(400);

    expect((await as(ctx.app, w.bob).delete(`/asks/${w.askId}`)).statusCode).toBe(404); // only the author can close
    expect((await as(ctx.app, w.alice).delete(`/asks/${w.askId}`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.carol).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'noodle' })).statusCode).toBe(400);
    expect(await asksOf(w.bob)).toEqual([]); // closed asks leave friends' feeds
    expect((await asksOf(w.alice))[0]!.open).toBe(false); // but the author still sees it for a week
  });

  it('expires asks after their window', async () => {
    const w = await world();
    await ctx.db.execute(sql`update asks set closes_at = now() - interval '1 minute'`);
    expect(await asksOf(w.bob)).toEqual([]);
  });

  it('lets repliers delete their own suggestions only', async () => {
    const w = await world();
    const { id } = (await as(ctx.app, w.bob).post(`/asks/${w.askId}/replies`, { googlePlaceId: 'ramen' })).json();
    expect((await as(ctx.app, w.carol).delete(`/asks/${w.askId}/replies/${id}`)).statusCode).toBe(403);
    expect((await as(ctx.app, w.bob).delete(`/asks/${w.askId}/replies/${id}`)).statusCode).toBe(204);
  });
});
