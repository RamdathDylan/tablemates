import { describe, expect, it } from 'vitest';

import { as, setupTestApp, signup } from './helpers';

describe('notifications', () => {
  const ctx = setupTestApp();
  const summary = async (user: Awaited<ReturnType<typeof signup>>) =>
    (await as(ctx.app, user).get('/notifications/summary')).json();

  it('counts pending incoming requests for the badge', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const carol = await signup(ctx.app, 'carol');
    expect((await summary(bob)).pendingFriendRequests).toBe(0);

    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });
    const { requestId } = (await as(ctx.app, carol).post('/friends/requests', { username: 'bob' })).json();
    expect((await summary(bob)).pendingFriendRequests).toBe(2);
    // Outgoing requests don't count toward the sender's badge.
    expect((await summary(alice)).pendingFriendRequests).toBe(0);

    await as(ctx.app, bob).post(`/friends/requests/${requestId}/decline`);
    expect((await summary(bob)).pendingFriendRequests).toBe(1);
  });

  it('alerts the requester once when their request is accepted', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    await as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`);

    expect((await summary(bob)).unreadAccepted).toEqual([]);
    const { unreadAccepted, pendingFriendRequests } = await summary(alice);
    expect(pendingFriendRequests).toBe(0);
    expect(unreadAccepted).toHaveLength(1);
    expect(unreadAccepted[0].user).toMatchObject({ username: 'bob', displayName: 'bob' });
    expect(unreadAccepted[0].user).not.toHaveProperty('email');

    const read = await as(ctx.app, alice).post('/notifications/read', { ids: [unreadAccepted[0].id] });
    expect(read.statusCode).toBe(204);
    expect((await summary(alice)).unreadAccepted).toEqual([]);
  });

  it('alerts the original requester when acceptance happens by requesting back', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });
    await as(ctx.app, bob).post('/friends/requests', { username: 'alice' });
    expect((await summary(alice)).unreadAccepted.map((a: { user: { username: string } }) => a.user.username)).toEqual(['bob']);
    expect((await summary(bob)).unreadAccepted).toEqual([]);
  });

  it("can't mark someone else's notifications read", async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    await as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`);
    const [alert] = (await summary(alice)).unreadAccepted;
    await as(ctx.app, bob).post('/notifications/read', { ids: [alert.id] });
    expect((await summary(alice)).unreadAccepted).toHaveLength(1);
  });

  it('clears the alert when the friendship is removed', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    await as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`);
    await as(ctx.app, bob).delete(`/friends/${alice.id}`);
    expect((await summary(alice)).unreadAccepted).toEqual([]);
  });

  it('a second accept of the same request is rejected and writes no extra alert', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    const results = await Promise.all([
      as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`),
      as(ctx.app, bob).post(`/friends/requests/${requestId}/accept`),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    expect((await summary(alice)).unreadAccepted).toHaveLength(1);
  });
});
