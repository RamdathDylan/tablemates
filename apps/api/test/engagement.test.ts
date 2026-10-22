import type { Comment, FeedItem, NotificationItem } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('reactions and comments', () => {
  const ctx = setupTestApp();

  /** bob reviews Luigi's; alice and carol are bob's friends (not each other's); dave is a stranger. */
  async function world(audience = 'friends') {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, carol!, bob!);
    ctx.places.add('luigi', "Luigi's");
    const visit = (
      await as(ctx.app, bob!).post('/visits', {
        googlePlaceId: 'luigi',
        visitedAt: '2026-10-01',
        audience,
        review: { rating: 5, recommends: true, body: 'Get the cacio e pepe' },
      })
    ).json();
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, reviewId: visit.review.id as string };
  }
  const inboxOf = async (u: TestUser) => ((await as(ctx.app, u).get('/notifications')).json().items as NotificationItem[]);
  const feedItem = async (u: TestUser) => ((await as(ctx.app, u).get('/feed')).json().items as FeedItem[])[0]!;

  it('reacts idempotently, counts per kind, and reports your own reactions', async () => {
    const w = await world();
    const api = as(ctx.app, w.alice);
    expect((await api.put(`/reviews/${w.reviewId}/reactions/yum`)).statusCode).toBe(204);
    expect((await api.put(`/reviews/${w.reviewId}/reactions/yum`)).statusCode).toBe(204);
    await api.put(`/reviews/${w.reviewId}/reactions/going`);
    await as(ctx.app, w.carol).put(`/reviews/${w.reviewId}/reactions/yum`);

    expect((await feedItem(w.alice)).engagement).toEqual({ yum: 2, going: 1, mine: expect.arrayContaining(['yum', 'going']), comments: 0 });
    expect((await feedItem(w.carol)).engagement.mine).toEqual(['yum']);

    await api.delete(`/reviews/${w.reviewId}/reactions/yum`);
    expect((await feedItem(w.alice)).engagement).toMatchObject({ yum: 1, mine: ['going'] });
    expect((await as(ctx.app, w.alice).put(`/reviews/${w.reviewId}/reactions/love`)).statusCode).toBe(400);
  });

  it('notifies the author once per new reaction', async () => {
    const w = await world();
    await as(ctx.app, w.alice).put(`/reviews/${w.reviewId}/reactions/yum`);
    await as(ctx.app, w.alice).put(`/reviews/${w.reviewId}/reactions/yum`);
    const reactions = (await inboxOf(w.bob)).filter((n) => n.type === 'reaction');
    expect(reactions).toHaveLength(1);
    expect(reactions[0]).toMatchObject({ reaction: 'yum', actor: { username: 'alice' }, restaurant: { name: "Luigi's" } });
  });

  it("can't touch a review you can't see: strangers, private, and close-friends visits", async () => {
    for (const audience of ['friends', 'private', 'close_friends']) {
      const w = await world(audience);
      const outsider = audience === 'friends' ? w.dave : w.alice;
      const api = as(ctx.app, outsider);
      expect((await api.put(`/reviews/${w.reviewId}/reactions/yum`)).statusCode, audience).toBe(404);
      expect((await api.get(`/reviews/${w.reviewId}/comments`)).statusCode, audience).toBe(404);
      expect((await api.post(`/reviews/${w.reviewId}/comments`, { body: 'hi' })).statusCode, audience).toBe(404);
      await ctx.db.execute(
        (await import('drizzle-orm')).sql`truncate users, friendships, restaurants, visits, reviews, reactions, comments, notifications cascade`,
      );
    }
  });

  it('threads comments and notifies the author and earlier commenters', async () => {
    const w = await world();
    await as(ctx.app, w.alice).post(`/reviews/${w.reviewId}/comments`, { body: 'Adding it to my list!' });
    await as(ctx.app, w.carol).post(`/reviews/${w.reviewId}/comments`, { body: 'Me too' });

    const thread = (await as(ctx.app, w.bob).get(`/reviews/${w.reviewId}/comments`)).json() as Comment[];
    expect(thread.map((c) => [c.author.username, c.body])).toEqual([
      ['alice', 'Adding it to my list!'],
      ['carol', 'Me too'],
    ]);
    expect((await feedItem(w.alice)).engagement.comments).toBe(2);

    const bobComments = (await inboxOf(w.bob)).filter((n) => n.type === 'comment');
    expect(bobComments.map((n) => n.excerpt)).toEqual(['Me too', 'Adding it to my list!']);
    // Alice was already in the thread, so she hears about Carol's reply; Carol isn't told about her own.
    expect((await inboxOf(w.alice)).filter((n) => n.type === 'comment').map((n) => n.actor.username)).toEqual(['carol']);
    expect((await inboxOf(w.carol)).filter((n) => n.type === 'comment')).toEqual([]);
  });

  it('lets the comment author or the review owner delete a comment, nobody else', async () => {
    const w = await world();
    const { id } = (await as(ctx.app, w.alice).post(`/reviews/${w.reviewId}/comments`, { body: 'hello' })).json();
    expect((await as(ctx.app, w.carol).delete(`/comments/${id}`)).statusCode).toBe(403);
    const thread = (await as(ctx.app, w.bob).get(`/reviews/${w.reviewId}/comments`)).json() as Comment[];
    expect(thread[0]!.canDelete).toBe(true);
    expect((await as(ctx.app, w.bob).delete(`/comments/${id}`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).get(`/reviews/${w.reviewId}/comments`)).json()).toEqual([]);
  });

  it('rejects empty and overlong comments', async () => {
    const w = await world();
    expect((await as(ctx.app, w.alice).post(`/reviews/${w.reviewId}/comments`, { body: '   ' })).statusCode).toBe(400);
    expect((await as(ctx.app, w.alice).post(`/reviews/${w.reviewId}/comments`, { body: 'x'.repeat(501) })).statusCode).toBe(400);
  });
});
