import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { PushMessage, PushProvider, PushResult } from '../src/push/types';
import { PushWorker } from '../src/push/worker';
import { as, setupTestApp, signup, type TestUser } from './helpers';

class FakePush implements PushProvider {
  sent: PushMessage[] = [];
  gone = new Set<string>();
  async send(messages: PushMessage[]): Promise<PushResult[]> {
    this.sent.push(...messages);
    return messages.map((m) => (this.gone.has(m.to) ? { ok: false, deviceGone: true } : { ok: true }));
  }
}

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

describe('push notifications', () => {
  const ctx = setupTestApp();
  const register = (u: TestUser, token: string) => as(ctx.app, u).post('/me/push-tokens', { token, platform: 'ios' });

  function worker() {
    const push = new FakePush();
    return { push, worker: new PushWorker(ctx.db, push) };
  }

  it('pushes a friend request to every device of the recipient, once', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await register(bob, TOKEN_A);
    await register(bob, TOKEN_B);
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });

    const { push, worker: w } = worker();
    expect(await w.runOnce()).toBe(2);
    expect(push.sent.map((m) => m.to).sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(push.sent[0]).toMatchObject({ title: 'New friend request', body: 'alice wants to be friends', data: { type: 'friend_request', username: 'alice' } });
    // Already marked pushed: a second run sends nothing.
    expect(await w.runOnce()).toBe(0);
  });

  it('respects muted types (the inbox still gets them)', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await register(bob, TOKEN_A);
    const patch = await as(ctx.app, bob).patch('/me/notification-settings', { mutedPush: ['friend_request'] });
    expect(patch.json()).toEqual({ mutedPush: ['friend_request'] });
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });

    const { push, worker: w } = worker();
    await w.runOnce();
    expect(push.sent).toEqual([]);
    expect((await as(ctx.app, bob).get('/notifications')).json().items).toHaveLength(1);
  });

  it('removes tokens Expo reports as unregistered', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await register(bob, TOKEN_A);
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });
    const { push, worker: w } = worker();
    push.gone.add(TOKEN_A);
    await w.runOnce();
    const rows = await ctx.db.execute(sql`select token from push_tokens`);
    expect(rows).toHaveLength(0);
  });

  it('moves a token to whoever signed in last, and unregisters on sign-out', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const carol = await signup(ctx.app, 'carol');
    await register(alice, TOKEN_A);
    await register(bob, TOKEN_A); // same phone, bob signs in
    await as(ctx.app, carol).post('/friends/requests', { username: 'alice' });
    const { push, worker: w } = worker();
    await w.runOnce();
    expect(push.sent).toEqual([]); // alice no longer owns the device

    // A user can't unregister someone else's token.
    await as(ctx.app, alice).delete(`/me/push-tokens/${encodeURIComponent(TOKEN_A)}`);
    expect(await ctx.db.execute(sql`select token from push_tokens`)).toHaveLength(1);
    await as(ctx.app, bob).delete(`/me/push-tokens/${encodeURIComponent(TOKEN_A)}`);
    expect(await ctx.db.execute(sql`select token from push_tokens`)).toHaveLength(0);
  });

  it('skips stale notifications instead of pushing them late', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await register(bob, TOKEN_A);
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });
    await ctx.db.execute(sql`update notifications set created_at = now() - interval '2 hours'`);
    const { push, worker: w } = worker();
    await w.runOnce();
    expect(push.sent).toEqual([]);
  });

  it('rejects things that are not Expo push tokens', async () => {
    const alice = await signup(ctx.app, 'alice');
    expect((await register(alice, 'not-a-token')).statusCode).toBe(400);
  });
});
