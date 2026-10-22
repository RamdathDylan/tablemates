import type { NotificationItem, PlateToday } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { platePrompts } from '../src/db/schema';
import { localDate, zonedTimeToUtc } from '../src/lib/zoned';
import { runPlatePrompts } from '../src/routes/plates';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('time zone math', () => {
  it('converts local wall-clock times to UTC across DST', () => {
    expect(zonedTimeToUtc('2026-10-22', 12, 0, 'America/New_York').toISOString()).toBe('2026-10-22T16:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', 12, 0, 'America/New_York').toISOString()).toBe('2026-12-01T17:00:00.000Z');
    expect(zonedTimeToUtc('2026-10-22', 19, 30, 'Asia/Tokyo').toISOString()).toBe('2026-10-22T10:30:00.000Z');
    expect(localDate('Asia/Tokyo', new Date('2026-10-22T20:00:00Z'))).toBe('2026-10-23');
  });
});

describe('plate check', () => {
  const ctx = setupTestApp();

  async function upload(u: TestUser, kind = 'plate') {
    const { photoId, uploadUrl } = (await as(ctx.app, u).post('/uploads', { kind, contentType: 'image/jpeg', bytes: 10 })).json();
    ctx.storage.put(uploadUrl.replace('https://storage.test/put/', ''), 10);
    await as(ctx.app, u).post(`/photos/${photoId}/confirm`);
    return photoId as string;
  }
  const today = async (u: TestUser) => (await as(ctx.app, u).get('/plates/today')).json() as PlateToday;
  /** Puts today's New York prompt `minutesAgo` minutes in the past. */
  async function promptGoesOff(minutesAgo = 1) {
    const at = new Date(Date.now() - minutesAgo * 60_000);
    await ctx.db
      .insert(platePrompts)
      .values({ timezone: 'America/New_York', localDate: localDate('America/New_York', new Date()), promptAt: at })
      .onConflictDoUpdate({ target: [platePrompts.timezone, platePrompts.localDate], set: { promptAt: at } });
  }

  async function world() {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    for (const u of [alice!, bob!, dave!]) await as(ctx.app, u).patch('/me', { timezone: 'America/New_York' });
    return { alice: alice!, bob: bob!, dave: dave! };
  }

  it('schedules one prompt per zone inside the lunch-to-dinner window, and alerts once when due', async () => {
    const w = await world();
    await as(ctx.app, w.dave).patch('/me', { timezone: 'Asia/Tokyo' });
    const morning = new Date('2026-10-22T13:00:00Z'); // 9:00 in New York, 22:00 in Tokyo
    await runPlatePrompts(ctx.db, morning, () => 0.5);
    const rows = (await ctx.db.execute(sql`select timezone, local_date, prompt_at from plate_prompts order by timezone`)) as unknown as {
      timezone: string;
      local_date: string;
      prompt_at: Date;
    }[];
    expect(rows.map((r) => r.timezone)).toEqual(['America/New_York', 'Asia/Tokyo']);
    // random 0.5 → 16:00 local: 20:00Z for New York (EDT).
    expect(new Date(rows[0]!.prompt_at).toISOString()).toBe('2026-10-22T20:00:00.000Z');

    // Not due yet in New York: no alerts.
    expect(((await as(ctx.app, w.alice).get('/notifications')).json().items as NotificationItem[]).filter((n) => n.type === 'plate_prompt')).toEqual([]);
    const later = new Date('2026-10-22T20:01:00Z');
    await runPlatePrompts(ctx.db, later);
    await runPlatePrompts(ctx.db, later);
    const alerts = ((await as(ctx.app, w.alice).get('/notifications')).json().items as NotificationItem[]).filter((n) => n.type === 'plate_prompt');
    expect(alerts).toHaveLength(1);
  });

  it('does nothing before the prompt, then hides friends’ plates until you post yours', async () => {
    const w = await world();
    expect((await today(w.alice)).prompt).toBeNull();
    expect((await as(ctx.app, w.alice).post('/plates', { photoId: await upload(w.alice) })).statusCode).toBe(400);

    await promptGoesOff(1);
    await as(ctx.app, w.bob).post('/plates', { photoId: await upload(w.bob) });
    const before = await today(w.alice);
    expect(before.friendsPosted).toBe(1);
    expect(before.posts).toEqual([]);

    expect((await as(ctx.app, w.alice).post('/plates', { photoId: await upload(w.alice) })).statusCode).toBe(201);
    const after = await today(w.alice);
    expect(after.mine?.late).toBe(false);
    expect(after.posts.map((p) => p.user.username)).toEqual(['bob']);
    expect(after.posts[0]!.photo.url).toContain('?sig=');
  });

  it('marks late posts and allows one per day', async () => {
    const w = await world();
    await promptGoesOff(12);
    await as(ctx.app, w.alice).post('/plates', { photoId: await upload(w.alice) });
    expect((await today(w.alice)).mine?.late).toBe(true);
    expect((await as(ctx.app, w.alice).post('/plates', { photoId: await upload(w.alice) })).statusCode).toBe(409);
  });

  it("never shows a stranger's plate, and requires a plate photo", async () => {
    const w = await world();
    await promptGoesOff(1);
    await as(ctx.app, w.dave).post('/plates', { photoId: await upload(w.dave) });
    await as(ctx.app, w.alice).post('/plates', { photoId: await upload(w.alice) });
    const t = await today(w.alice);
    expect(t.friendsPosted).toBe(0);
    expect(t.posts).toEqual([]);
    expect((await as(ctx.app, w.bob).post('/plates', { photoId: await upload(w.bob, 'review') })).statusCode).toBe(400);
  });

  it('rejects unknown time zones', async () => {
    const alice = await signup(ctx.app, 'alice');
    expect((await as(ctx.app, alice).patch('/me', { timezone: 'Mars/Olympus' })).statusCode).toBe(400);
  });
});
