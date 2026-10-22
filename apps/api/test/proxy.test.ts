import { describe, expect, it } from 'vitest';

import { parseTrustProxy } from '../src/env';
import { setupTestApp } from './helpers';

const attempt = (app: ReturnType<typeof setupTestApp>['app'], forwardedFor: string) =>
  app.inject({
    method: 'POST',
    url: '/auth/login',
    headers: { 'x-forwarded-for': forwardedFor },
    payload: { email: 'nobody@example.com', password: 'wrong password' },
  });

describe('TRUST_PROXY parsing', () => {
  it('trusts nobody by default, and accepts true, a hop count, or a list of addresses', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('true')).toBe(true);
    const twoHops = parseTrustProxy('2') as (address: string, hop: number) => boolean;
    expect([0, 1, 2].map((hop) => twoHops('10.0.0.1', hop))).toEqual([true, true, false]);
    expect(parseTrustProxy('10.0.0.0/8, 127.0.0.1')).toEqual(['10.0.0.0/8', '127.0.0.1']);
  });
});

describe('rate limits behind a trusted proxy', () => {
  const ctx = setupTestApp({ authRateLimit: { max: 2, timeWindow: '1 minute' }, trustProxy: true });

  it('limits each client separately, using the address the proxy reports', async () => {
    for (let i = 0; i < 2; i++) expect((await attempt(ctx.app, '203.0.113.1')).statusCode).not.toBe(429);
    expect((await attempt(ctx.app, '203.0.113.1')).statusCode).toBe(429);
    // A different client behind the same proxy still has its own budget.
    expect((await attempt(ctx.app, '203.0.113.2')).statusCode).not.toBe(429);
  });
});

describe('rate limits without a trusted proxy', () => {
  const ctx = setupTestApp({ authRateLimit: { max: 2, timeWindow: '1 minute' } });

  it('ignores X-Forwarded-For, so a client cannot spoof its way past the limit', async () => {
    for (const ip of ['198.51.100.1', '198.51.100.2']) expect((await attempt(ctx.app, ip)).statusCode).not.toBe(429);
    expect((await attempt(ctx.app, '198.51.100.3')).statusCode).toBe(429);
  });
});

// Runs when REDIS_URL points at a Redis server (for example `docker run -p 6379:6379 redis:7-alpine`).
describe.skipIf(!process.env.REDIS_URL)('rate limits shared through Redis', () => {
  it('counts attempts across separate API instances', async () => {
    const { Redis } = await import('ioredis');
    const { buildApp } = await import('../src/app');
    const { FakeMailer, FakePlaces, FakeStorage } = await import('./helpers');
    const { createDb } = await import('../src/db/client');
    const { TokenService } = await import('../src/lib/tokens');
    const { VerificationService } = await import('../src/lib/verification');
    const { testDatabaseUrl } = await import('./helpers');
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    const { db } = createDb(testDatabaseUrl());
    const instance = () =>
      buildApp({
        db,
        tokens: new TokenService(db, 'test-secret'),
        places: new FakePlaces(),
        verification: new VerificationService(db, new FakeMailer(), 'test-secret'),
        storage: new FakeStorage(),
        publicApiUrl: 'http://api.test',
        cookieSecure: false,
        corsOrigins: [],
        authRateLimit: { max: 2, timeWindow: '1 minute' },
        rateLimitRedis: redis,
      });
    const [a, b] = await Promise.all([instance(), instance()]);
    expect((await attempt(a, '1.1.1.1')).statusCode).not.toBe(429);
    expect((await attempt(b, '1.1.1.1')).statusCode).not.toBe(429);
    expect((await attempt(a, '1.1.1.1')).statusCode).toBe(429);
    await Promise.all([a.close(), b.close()]);
    redis.disconnect();
  });
});
