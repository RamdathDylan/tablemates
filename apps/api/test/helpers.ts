import type { PlaceResult } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach } from 'vitest';

import { buildApp } from '../src/app';
import { createDb, type Db } from '../src/db/client';
import '../src/env';
import { TokenService } from '../src/lib/tokens';
import type { PlacesProvider } from '../src/places/types';

export function testDatabaseUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('Set TEST_DATABASE_URL (see .env.example)');
  return url;
}

export class FakePlaces implements PlacesProvider {
  getCalls = 0;
  places = new Map<string, PlaceResult>();

  add(id: string, name: string) {
    this.places.set(id, {
      googlePlaceId: id,
      name,
      address: `1 ${name} St`,
      lat: 40.7,
      lng: -74,
      priceLevel: 2,
      cuisine: ['Italian'],
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

export interface TestUser {
  id: string;
  username: string;
  token: string;
  refreshToken: string;
}

/** Builds an app against the test database and wipes data before each test. */
export function setupTestApp() {
  const ctx = {} as { app: FastifyInstance; db: Db; places: FakePlaces };
  let close: () => Promise<void>;

  beforeAll(async () => {
    const created = createDb(testDatabaseUrl());
    close = created.close;
    ctx.db = created.db;
    ctx.places = new FakePlaces();
    ctx.app = await buildApp({
      db: ctx.db,
      tokens: new TokenService(ctx.db, 'test-secret'),
      places: ctx.places,
      cookieSecure: false,
      corsOrigins: ['http://localhost:8081'],
    });
  });

  beforeEach(async () => {
    await ctx.db.execute(
      sql`truncate users, friendships, restaurants, visits, reviews, refresh_tokens cascade`,
    );
    ctx.places.places.clear();
    ctx.places.getCalls = 0;
  });

  afterAll(async () => {
    await ctx.app.close();
    await close();
  });

  return ctx;
}

export async function signup(app: FastifyInstance, username: string): Promise<TestUser> {
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

export function as(app: FastifyInstance, user: TestUser) {
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE') => (url: string, payload?: object) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${user.token}` } });
  return { get: call('GET'), post: call('POST'), patch: call('PATCH'), delete: call('DELETE') };
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
) {
  const res = await as(app, user).post('/visits', {
    googlePlaceId,
    visitedAt: '2026-10-01',
    review,
  });
  if (res.statusCode !== 201) throw new Error(`log visit failed: ${res.body}`);
  return res.json();
}
