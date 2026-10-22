import type { NotificationItem, Page, Profile, Streak } from '@tablemates/shared';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { users } from '../src/db/schema';
import { computeStreak, runStreakNudges, weekStart } from '../src/lib/streaks';
import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('streak math', () => {
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19'); // Thursday
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-19')).toBe('2026-10-19');
  });

  it("keeps last week's streak alive until this week ends, and tracks the best run", () => {
    const weeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-12'];
    expect(computeStreak(weeks, '2026-10-19')).toEqual({ current: 1, best: 4, thisWeekDone: false });
    expect(computeStreak([...weeks, '2026-10-19'], '2026-10-19')).toEqual({ current: 2, best: 4, thisWeekDone: true });
    // A missed week breaks it.
    expect(computeStreak(weeks, '2026-10-26')).toEqual({ current: 0, best: 4, thisWeekDone: false });
    expect(computeStreak([], '2026-10-26')).toEqual({ current: 0, best: 0, thisWeekDone: false });
  });
});

describe('streaks', () => {
  const ctx = setupTestApp();
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const log = (u: TestUser, visitedAt: string, audience = 'friends') =>
    as(ctx.app, u).post('/visits', { googlePlaceId: 'joes', visitedAt, audience });

  it('counts consecutive weeks, and friends only count the visits they can see', async () => {
    const [alice, bob, dave] = await Promise.all(['alice', 'bob', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    ctx.places.add('joes', "Joe's Pizza");
    // This week's visit is private; the two before it are for friends.
    const today = new Date().toISOString().slice(0, 10);
    await log(alice!, today, 'private');
    await log(alice!, daysAgo(7));
    await log(alice!, daysAgo(14));

    expect((await as(ctx.app, alice!).get('/me/streak')).json()).toEqual({ current: 3, best: 3, thisWeekDone: true });
    const bobSees = (await as(ctx.app, bob!).get('/users/alice')).json() as Profile;
    expect(bobSees.streak).toEqual({ current: 2, best: 2, thisWeekDone: false } satisfies Streak);
    expect(((await as(ctx.app, dave!).get('/users/alice')).json() as Profile).streak).toBeUndefined();
  });

  it('nudges people with a streak on Sunday evening, once, unless they already logged this week', async () => {
    const [maya, bob, carol] = await Promise.all(['maya', 'bob', 'carol'].map((n) => signup(ctx.app, n)));
    ctx.places.add('joes', "Joe's Pizza");
    await ctx.db.update(users).set({ timezone: 'America/New_York' });
    await log(maya!, '2026-10-14'); // last week: streak of 1, at risk
    await log(bob!, '2026-10-14');
    await log(bob!, '2026-10-21'); // already logged this week
    // carol has no streak.

    const saturdayEvening = new Date('2026-10-24T22:00:00Z');
    const sundayAfternoon = new Date('2026-10-25T20:00:00Z'); // 16:00 in New York
    const sundayEvening = new Date('2026-10-25T22:00:00Z'); // 18:00 in New York
    expect(await runStreakNudges(ctx.db, saturdayEvening)).toBe(0);
    expect(await runStreakNudges(ctx.db, sundayAfternoon)).toBe(0);
    expect(await runStreakNudges(ctx.db, sundayEvening)).toBe(1);
    expect(await runStreakNudges(ctx.db, sundayEvening)).toBe(0);

    const inbox = async (u: TestUser) => ((await as(ctx.app, u).get('/notifications')).json() as Page<NotificationItem>).items;
    expect((await inbox(maya!)).map((n) => [n.type, n.count])).toEqual([['streak_nudge', 1]]);
    expect(await inbox(bob!)).toEqual([]);
    expect(await inbox(carol!)).toEqual([]);
    const [row] = await ctx.db.select({ week: users.streakNudgedWeek }).from(users).where(eq(users.id, maya!.id));
    expect(row!.week).toBe('2026-10-19');
  });
});
