import { describe, expect, it } from 'vitest';

import { setupTestApp, signup } from './helpers';

describe('auth', () => {
  const ctx = setupTestApp();

  it('rejects duplicate email and username', async () => {
    await signup(ctx.app, 'alice');
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'ALICE@example.com', password: 'longenough', username: 'alice2', displayName: 'A' },
    });
    expect(res.statusCode).toBe(409);
    const res2 = await ctx.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'new@example.com', password: 'longenough', username: 'Alice', displayName: 'A' },
    });
    expect(res2.statusCode).toBe(409);
  });

  it('validates signup input', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { email: 'nope', password: 'short', username: 'a', displayName: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('validation_error');
  });

  it('logs in with the right password only', async () => {
    await signup(ctx.app, 'alice');
    const login = (password: string) =>
      ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'alice@example.com', password } });
    expect((await login('wrong password')).statusCode).toBe(401);
    expect((await login('correct horse battery')).statusCode).toBe(200);
  });

  it('requires a valid access token on protected routes', async () => {
    expect((await ctx.app.inject({ url: '/feed' })).statusCode).toBe(401);
    expect(
      (await ctx.app.inject({ url: '/feed', headers: { authorization: 'Bearer garbage' } })).statusCode,
    ).toBe(401);
  });

  it('rotates refresh tokens and revokes every session when an old one is reused', async () => {
    const alice = await signup(ctx.app, 'alice');
    const refresh = (refreshToken: string) =>
      ctx.app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });

    const first = await refresh(alice.refreshToken);
    expect(first.statusCode).toBe(200);
    const rotated = first.json().refreshToken;
    expect(rotated).not.toBe(alice.refreshToken);

    // Reusing the old token looks like theft: it fails and kills the rotated one too.
    expect((await refresh(alice.refreshToken)).statusCode).toBe(401);
    expect((await refresh(rotated)).statusCode).toBe(401);
  });

  it('uses an httpOnly cookie for web clients', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/signup',
      headers: { 'x-tablemates-client': 'web' },
      payload: { email: 'w@example.com', password: 'longenough', username: 'webby', displayName: 'W' },
    });
    expect(res.json().refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'tm_refresh');
    expect(cookie?.httpOnly).toBe(true);

    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { 'x-tablemates-client': 'web' },
      cookies: { tm_refresh: cookie!.value },
      payload: {},
    });
    expect(refreshed.statusCode).toBe(200);
    expect(refreshed.json().accessToken).toBeTruthy();
  });

  it('allows browser preflight for every method the client uses', async () => {
    for (const method of ['PATCH', 'DELETE']) {
      const res = await ctx.app.inject({
        method: 'OPTIONS',
        url: '/me',
        headers: { origin: 'http://localhost:8081', 'access-control-request-method': method },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers['access-control-allow-methods']).toContain(method);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    }
  });

  it('logout revokes the refresh token', async () => {
    const alice = await signup(ctx.app, 'alice');
    await ctx.app.inject({ method: 'POST', url: '/auth/logout', payload: { refreshToken: alice.refreshToken } });
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: alice.refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});
