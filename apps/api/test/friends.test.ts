import { describe, expect, it } from 'vitest';

import { as, setupTestApp, signup } from './helpers';

describe('friend requests', () => {
  const ctx = setupTestApp();

  it('rejects requests to yourself and to unknown users', async () => {
    const alice = await signup(ctx.app, 'alice');
    expect((await as(ctx.app, alice).post('/friends/requests', { username: 'alice' })).statusCode).toBe(400);
    expect((await as(ctx.app, alice).post('/friends/requests', { username: 'nobody' })).statusCode).toBe(404);
  });

  it('rejects duplicate requests', async () => {
    const alice = await signup(ctx.app, 'alice');
    await signup(ctx.app, 'bob');
    const api = as(ctx.app, alice);
    expect((await api.post('/friends/requests', { username: 'bob' })).statusCode).toBe(201);
    expect((await api.post('/friends/requests', { username: 'bob' })).statusCode).toBe(409);
  });

  it('accepts automatically when the other person already sent a request', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    await as(ctx.app, alice).post('/friends/requests', { username: 'bob' });
    const res = await as(ctx.app, bob).post('/friends/requests', { username: 'alice' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('friends');
    expect((await as(ctx.app, alice).get('/friends')).json().map((u: { username: string }) => u.username)).toEqual(['bob']);
    expect((await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).statusCode).toBe(409);
  });

  it('only the recipient can accept', async () => {
    const alice = await signup(ctx.app, 'alice');
    await signup(ctx.app, 'bob');
    const carol = await signup(ctx.app, 'carol');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();
    expect((await as(ctx.app, alice).post(`/friends/requests/${requestId}/accept`)).statusCode).toBe(404);
    expect((await as(ctx.app, carol).post(`/friends/requests/${requestId}/accept`)).statusCode).toBe(404);
    expect((await as(ctx.app, carol).post(`/friends/requests/${requestId}/decline`)).statusCode).toBe(404);
  });

  it('lists requests by direction and lets a declined request be re-sent', async () => {
    const alice = await signup(ctx.app, 'alice');
    const bob = await signup(ctx.app, 'bob');
    const { requestId } = (await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).json();

    const [incoming] = (await as(ctx.app, bob).get('/friends/requests')).json();
    expect(incoming).toMatchObject({ id: requestId, direction: 'incoming', user: { username: 'alice' } });
    const [outgoing] = (await as(ctx.app, alice).get('/friends/requests')).json();
    expect(outgoing.direction).toBe('outgoing');

    const search = (await as(ctx.app, bob).get('/users/search?q=ali')).json();
    expect(search[0]).toMatchObject({ username: 'alice', friendship: 'incoming', requestId });

    expect((await as(ctx.app, bob).post(`/friends/requests/${requestId}/decline`)).statusCode).toBe(204);
    expect((await as(ctx.app, bob).get('/friends/requests')).json()).toEqual([]);
    expect((await as(ctx.app, alice).post('/friends/requests', { username: 'bob' })).statusCode).toBe(201);
  });

  it('treats malformed ids as not found', async () => {
    const alice = await signup(ctx.app, 'alice');
    expect((await as(ctx.app, alice).post('/friends/requests/not-a-uuid/accept')).statusCode).toBe(404);
  });
});
