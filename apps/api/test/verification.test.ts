import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { as, setupTestApp, signupUnverified } from './helpers';

describe('email verification', () => {
  const ctx = setupTestApp();
  const verify = (token: string, code: string) =>
    ctx.app.inject({
      method: 'POST',
      url: '/auth/verify-email',
      headers: { authorization: `Bearer ${token}` },
      payload: { code },
    });

  it('emails a 6-digit code at sign-up and reports the account unverified', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    expect(ctx.mailer.sent).toHaveLength(1);
    expect(ctx.mailer.sent[0]!.to).toBe('alice@example.com');
    expect(ctx.mailer.codeFor('alice@example.com')).toMatch(/^\d{6}$/);
    const me = (await as(ctx.app, alice).get('/me')).json();
    expect(me.emailVerified).toBe(false);
  });

  it('blocks everything but /me and verification until verified', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    for (const url of ['/feed', '/friends', '/users/search?q=a', '/notifications/summary']) {
      const res = await as(ctx.app, alice).get(url);
      expect(res.statusCode, url).toBe(403);
      expect(res.json().error).toBe('email_unverified');
    }
    expect((await as(ctx.app, alice).get('/me')).statusCode).toBe(200);
  });

  it('verifies with the right code and returns a token that unlocks the app', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    const res = await verify(alice.token, ctx.mailer.codeFor('alice@example.com'));
    expect(res.statusCode).toBe(200);
    expect(res.json().user.emailVerified).toBe(true);
    const fresh = { ...alice, token: res.json().accessToken };
    expect((await as(ctx.app, fresh).get('/feed')).statusCode).toBe(200);
    // Refreshing later keeps the verified claim.
    const refreshed = await ctx.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: alice.refreshToken },
    });
    expect((await as(ctx.app, { ...alice, token: refreshed.json().accessToken }).get('/feed')).statusCode).toBe(200);
  });

  it('rejects wrong codes and locks out after 5 attempts', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    const right = ctx.mailer.codeFor('alice@example.com');
    const wrong = right === '000000' ? '111111' : '000000';
    const first = await verify(alice.token, wrong);
    expect(first.statusCode).toBe(400);
    expect(first.json().message).toContain('4 tries left');
    for (let i = 0; i < 4; i++) await verify(alice.token, wrong);
    // Even the right code is refused once locked out.
    expect((await verify(alice.token, right)).statusCode).toBe(429);
  });

  it('rejects an expired code', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    await ctx.db.execute(sql`update email_verification_codes set expires_at = now() - interval '1 minute'`);
    const res = await verify(alice.token, ctx.mailer.codeFor('alice@example.com'));
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('expired');
  });

  it('enforces a resend cooldown, and a resent code replaces the old one', async () => {
    const alice = await signupUnverified(ctx.app, 'alice');
    const oldCode = ctx.mailer.codeFor('alice@example.com');
    const tooSoon = await as(ctx.app, alice).post('/auth/resend-verification');
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().message).toMatch(/Wait \d+ seconds/);

    await ctx.db.execute(sql`update email_verification_codes set last_sent_at = now() - interval '2 minutes'`);
    expect((await as(ctx.app, alice).post('/auth/resend-verification')).statusCode).toBe(204);
    const newCode = ctx.mailer.codeFor('alice@example.com');
    if (newCode !== oldCode) expect((await verify(alice.token, oldCode)).statusCode).toBe(400);
    expect((await verify(alice.token, newCode)).statusCode).toBe(200);
  });

  it('never stores the code in plain text', async () => {
    await signupUnverified(ctx.app, 'alice');
    const code = ctx.mailer.codeFor('alice@example.com');
    const rows = await ctx.db.execute(sql`select code_hash from email_verification_codes`);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it('rejects access tokens minted before the verified claim existed', async () => {
    const { SignJWT } = await import('jose');
    const legacy = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('test-secret'));
    const res = await ctx.app.inject({ url: '/me', headers: { authorization: `Bearer ${legacy}` } });
    expect(res.statusCode).toBe(401);
  });
});

describe('auth rate limiting', () => {
  const ctx = setupTestApp({ authRateLimit: { max: 3, timeWindow: '1 minute' } });

  it('limits login attempts per IP', async () => {
    const attempt = () =>
      ctx.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x@example.com', password: 'nope' } });
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await attempt()).statusCode);
    expect(codes).toEqual([401, 401, 401, 429]);
  });
});
