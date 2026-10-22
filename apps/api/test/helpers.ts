import type { PlaceResult } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { buildApp, type AppOptions } from '../src/app';
import { createDb, type Db } from '../src/db/client';
import '../src/env';
import { clearTasteCache } from '../src/lib/taste';
import { TokenService } from '../src/lib/tokens';
import { VerificationService } from '../src/lib/verification';
import type { Email, Mailer } from '../src/mail/types';
import type { PlacesProvider } from '../src/places/types';
import type { Storage } from '../src/storage/types';

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Set TEST_DATABASE_URL (see .env.example)');
  return url;
}

export class FakePlaces implements PlacesProvider {
  getCalls = 0;
  places = new Map<string, PlaceResult>();

  add(id: string, name: string, extra: Partial<PlaceResult> = {}) {
    this.places.set(id, {
      googlePlaceId: id,
      name,
      address: `1 ${name} St`,
      lat: 40.7,
      lng: -74,
      priceLevel: 2,
      cuisine: ['Italian'],
      ...extra,
    });
  }

  async search({ q }: { q: string }) {
    return [...this.places.values()].filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  }

  async get(id: string) {
    this.getCalls++;
    return this.places.get(id) ?? null;
  }
}

export class FakeMailer implements Mailer {
  sent: Email[] = [];

  async send(email: Email) {
    this.sent.push(email);
  }

  /** The most recent verification code sent to an address. */
  codeFor(to: string): string {
    const email = [...this.sent].reverse().find((e) => e.to === to);
    const code = email?.subject.match(/^(\d{6}) /)?.[1];
    if (!code) throw new Error(`no code sent to ${to}`);
    return code;
  }
}

/** In-memory object store. "Uploading" is simulated with put(). */
export class FakeStorage implements Storage {
  objects = new Map<string, number>();
  put(key: string, bytes: number) {
    this.objects.set(key, bytes);
  }
  async presignPut(key: string) {
    return `https://storage.test/put/${key}`;
  }
  async presignGet(key: string) {
    return `https://storage.test/get/${key}?sig=1`;
  }
  async head(key: string) {
    const bytes = this.objects.get(key);
    return bytes === undefined ? null : { bytes };
  }
  async delete(keys: string[]) {
    for (const k of keys) this.objects.delete(k);
  }
  async ensureReady() {}
}

export interface TestUser {
  id: string;
  username: string;
  token: string;
  refreshToken: string;
}

/** Builds an app against the test database and wipes data before each test. */
const mailers = new WeakMap<FastifyInstance, FakeMailer>();

export function setupTestApp(options: Pick<AppOptions, 'authRateLimit'> = {}) {
  const ctx = {} as { app: FastifyInstance; db: Db; places: FakePlaces; mailer: FakeMailer; storage: FakeStorage };
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDb(testDatabaseUrl());
    close = created.close;
    ctx.db = created.db;
    ctx.places = new FakePlaces();
    ctx.mailer = new FakeMailer();
    ctx.storage = new FakeStorage();
    ctx.app = await buildApp({
      db: ctx.db,
      tokens: new TokenService(ctx.db, 'test-secret'),
      places: ctx.places,
      verification: new VerificationService(ctx.db, ctx.mailer, 'test-secret'),
      storage: ctx.storage,
      publicApiUrl: 'http://api.test',
      cookieSecure: false,
      corsOrigins: ['http://localhost:8081'],
      // Tests sign up many users from one IP; rate-limit tests pass their own limit.
      authRateLimit: { max: 1000, timeWindow: '1 minute' },
      ...options,
    });
    mailers.set(ctx.app, ctx.mailer);
  });

  beforeEach(async () => {
    await ctx.db.execute(
      sql`truncate users, checkins, tables, table_members, plate_prompts, plate_posts, stories, story_views, favorites, photos, review_photos, user_badges, lists, list_items, list_follows, review_dishes, plans, plan_members, plan_options, plan_votes, asks, ask_replies, push_tokens, reactions, comments, visit_companions, friendships, notifications, email_verification_codes, saved_places, close_friends, restaurants, visits, reviews, refresh_tokens cascade`,
    );
    ctx.places.places.clear();
    ctx.places.getCalls = 0;
    ctx.mailer.sent = [];
    ctx.storage.objects.clear();
    clearTasteCache();
  });

  afterAll(async () => {
    await ctx.app.close();
    await close();
  });

  return ctx;
}

/** Signs up without entering the emailed code. */
export async function signupUnverified(app: FastifyInstance, username: string): Promise<TestUser> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/signup',
    payload: {
      email: `${username}@example.com`,
      password: 'correct horse battery',
      username,
      displayName: username,
    },
  });
  if (res.statusCode !== 201) throw new Error(`signup failed: ${res.body}`);
  const body = res.json();
  return { id: body.user.id, username, token: body.accessToken, refreshToken: body.refreshToken };
}

/** Signs up and verifies the email, like a user who finished onboarding. */
export async function signup(
  app: FastifyInstance,
  username: string,
  mailer?: FakeMailer,
): Promise<TestUser> {
  const user = await signupUnverified(app, username);
  const fake = mailer ?? mailers.get(app);
  if (!fake) throw new Error('signup() needs the app built by setupTestApp');
  const res = await app.inject({
    method: 'POST',
    url: '/auth/verify-email',
    headers: { authorization: `Bearer ${user.token}` },
    payload: { code: fake.codeFor(`${username}@example.com`) },
  });
  if (res.statusCode !== 200) throw new Error(`verify failed: ${res.body}`);
  return { ...user, token: res.json().accessToken };
}

export function as(app: FastifyInstance, user: TestUser) {
  const call = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE') => (url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${user.token}` } });
  return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), delete: call('DELETE') };
}

export async function befriend(app: FastifyInstance, a: TestUser, b: TestUser) {
  const sent = await as(app, a).post('/friends/requests', { username: b.username });
  const accepted = await as(app, b).post(`/friends/requests/${sent.json().requestId}/accept`);
  if (accepted.statusCode !== 200) throw new Error(`accept failed: ${accepted.body}`);
}

export async function logVisit(
  app: FastifyInstance,
  user: TestUser,
  googlePlaceId: string,
  review?: { rating: number; recommends: boolean; body?: string },
  visitedAt = '2026-10-01',
) {
  const res = await as(app, user).post('/visits', { googlePlaceId, visitedAt, review });
  if (res.statusCode !== 201) throw new Error(`log visit failed: ${res.body}`);
  return res.json();
}
