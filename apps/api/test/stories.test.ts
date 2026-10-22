import type { NotificationItem, StoryGroup } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { expireStories } from '../src/routes/stories';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('stories', () => {
  const ctx = setupTestApp();

  async function upload(u: TestUser, kind = 'story') {
    const { photoId, uploadUrl } = (await as(ctx.app, u).post('/uploads', { kind, contentType: 'image/jpeg', bytes: 10 })).json();
    ctx.storage.put(uploadUrl.replace('https://storage.test/put/', ''), 10);
    await as(ctx.app, u).post(`/photos/${photoId}/confirm`);
    return photoId as string;
  }
  const post = async (u: TestUser, extra: object = {}) =>
    (await as(ctx.app, u).post('/stories', { photoId: await upload(u), caption: 'Tonight!', ...extra })).json().id as string;
  const feedOf = async (u: TestUser) => (await as(ctx.app, u).get('/stories')).json() as StoryGroup[];

  /** alice posts; bob is a close friend, carol a regular friend, dave a stranger. */
  async function world() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    await as(ctx.app, alice!).put(`/me/close-friends/${bob!.id}`);
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave! };
  }

  it("shows friends' stories by audience, never to strangers", async () => {
    const w = await world();
    await post(w.alice);
    await post(w.alice, { audience: 'close_friends', caption: 'Inner circle' });
    const captions = async (u: TestUser) => (await feedOf(u)).flatMap((g) => g.stories.map((s) => s.caption));
    expect(await captions(w.bob)).toEqual(['Tonight!', 'Inner circle']);
    expect(await captions(w.carol)).toEqual(['Tonight!']);
    expect(await captions(w.dave)).toEqual([]);
    expect((await feedOf(w.alice))[0]).toMatchObject({ isMine: true, allSeen: true });
  });

  it('tracks what you have seen and orders unseen authors first', async () => {
    const w = await world();
    const a = await post(w.alice);
    await befriend(ctx.app, w.carol, w.bob);
    await post(w.bob);
    let groups = await feedOf(w.carol);
    expect(groups.map((g) => [g.author.username, g.allSeen])).toEqual([
      ['bob', false],
      ['alice', false],
    ]);
    await as(ctx.app, w.carol).post(`/stories/${a}/view`);
    await as(ctx.app, w.carol).post(`/stories/${a}/view`);
    groups = await feedOf(w.carol);
    expect(groups.map((g) => [g.author.username, g.allSeen])).toEqual([
      ['bob', false],
      ['alice', true],
    ]);
  });

  it('lets only the author see viewers, and sends reactions to the author', async () => {
    const w = await world();
    const id = await post(w.alice);
    await as(ctx.app, w.bob).post(`/stories/${id}/view`);
    expect((await as(ctx.app, w.bob).get(`/stories/${id}/viewers`)).statusCode).toBe(403);
    const viewers = (await as(ctx.app, w.alice).get(`/stories/${id}/viewers`)).json();
    expect(viewers.map((v: { user: { username: string } }) => v.user.username)).toEqual(['bob']);

    expect((await as(ctx.app, w.bob).post(`/stories/${id}/react`, { emoji: '🔥' })).statusCode).toBe(204);
    expect((await as(ctx.app, w.bob).post(`/stories/${id}/react`, { emoji: '💩' })).statusCode).toBe(400);
    expect((await as(ctx.app, w.dave).post(`/stories/${id}/react`, { emoji: '🔥' })).statusCode).toBe(404);
    const inbox = (await as(ctx.app, w.alice).get('/notifications')).json().items as NotificationItem[];
    expect(inbox.find((n) => n.type === 'story_reaction')).toMatchObject({ emoji: '🔥', actor: { username: 'bob' } });
  });

  it('requires your own story photo', async () => {
    const w = await world();
    const reviewPhoto = await upload(w.alice, 'review');
    expect((await as(ctx.app, w.alice).post('/stories', { photoId: reviewPhoto })).statusCode).toBe(400);
    const bobs = await upload(w.bob);
    expect((await as(ctx.app, w.alice).post('/stories', { photoId: bobs })).statusCode).toBe(400);
  });

  it('expires stories after a day, deleting their photos', async () => {
    const w = await world();
    await post(w.alice);
    await ctx.db.execute(sql`update stories set expires_at = now() - interval '1 minute'`);
    expect(await feedOf(w.bob)).toEqual([]);
    expect(await expireStories(ctx.db, ctx.storage)).toBe(1);
    expect([...(await ctx.db.execute(sql`select id from photos where kind = 'story'`))]).toHaveLength(0);
    expect([...ctx.storage.objects.keys()].filter((k) => k.startsWith('story/'))).toEqual([]);
  });

  it('expires each story exactly once when two instances run the job together', async () => {
    const w = await world();
    await post(w.alice);
    await post(w.alice);
    await ctx.db.execute(sql`update stories set expires_at = now() - interval '1 minute'`);
    const deleted: string[] = [];
    const remove = ctx.storage.delete.bind(ctx.storage);
    ctx.storage.delete = async (keys) => {
      deleted.push(...keys);
      return remove(keys);
    };
    const counts = await Promise.all([expireStories(ctx.db, ctx.storage), expireStories(ctx.db, ctx.storage)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2);
    expect(deleted).toHaveLength(2);
    expect(new Set(deleted).size).toBe(2);
  });

  it('lets the author delete a story early', async () => {
    const w = await world();
    const id = await post(w.alice);
    expect((await as(ctx.app, w.bob).delete(`/stories/${id}`)).statusCode).toBe(404);
    expect((await as(ctx.app, w.alice).delete(`/stories/${id}`)).statusCode).toBe(204);
    expect(await feedOf(w.bob)).toEqual([]);
  });
});
