/** Weekly streaks: consecutive local weeks (Monday to Sunday) with at least one logged visit. */
import type { Streak } from '@tablemates/shared';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { users, visits } from '../db/schema';
import { notify } from './notify';
import { visitsOfFilter } from './visibility';
import { localDate, localWeekdayHour } from './zoned';

const DAY_MS = 86_400_000;

/** Monday of the week containing a YYYY-MM-DD date. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

const shiftWeeks = (monday: string, n: number) => new Date(new Date(`${monday}T00:00:00Z`).getTime() + n * 7 * DAY_MS).toISOString().slice(0, 10);

/** The streak for a set of active weeks (Mondays), as of the week starting `thisWeek`. */
export function computeStreak(activeWeeks: Iterable<string>, thisWeek: string): Streak {
  const weeks = new Set(activeWeeks);
  const thisWeekDone = weeks.has(thisWeek);
  // Last week's streak stays alive until this week ends.
  let current = 0;
  for (let w = thisWeekDone ? thisWeek : shiftWeeks(thisWeek, -1); weeks.has(w); w = shiftWeeks(w, -1)) current++;

  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const w of [...weeks].sort()) {
    run = prev && shiftWeeks(prev, 1) === w ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best: Math.max(best, current), thisWeekDone };
}

/** `owner`'s streak, counting only the visits `viewer` can see, in the owner's time zone. */
export async function streakFor(db: Pick<Db, 'select' | 'selectDistinct'>, ownerId: string, viewerId: string, now = new Date()): Promise<Streak> {
  const [[owner], rows] = await Promise.all([
    db.select({ timezone: users.timezone }).from(users).where(eq(users.id, ownerId)),
    db
      .selectDistinct({ week: sql<string>`to_char(date_trunc('week', ${visits.visitedAt}), 'YYYY-MM-DD')` })
      .from(visits)
      .where(visitsOfFilter(ownerId, viewerId)),
  ]);
  return computeStreak(rows.map((r) => r.week), weekStart(localDate(owner?.timezone ?? 'UTC', now)));
}

/**
 * Sunday from 17:00 local time: people with a streak who haven't logged this week
 * get one nudge. Run by the job runner.
 */
export async function runStreakNudges(db: Db, now = new Date()) {
  const zones = await db.selectDistinct({ tz: users.timezone }).from(users);
  let sent = 0;
  for (const { tz } of zones) {
    const { weekday, hour } = localWeekdayHour(tz, now);
    if (weekday !== 0 || hour < 17) continue;
    const thisWeek = weekStart(localDate(tz, now));
    const due = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.timezone, tz), or(isNull(users.streakNudgedWeek), ne(users.streakNudgedWeek, thisWeek))));
    for (const { id } of due) {
      await db.transaction(async (tx) => {
        // Claim the week first so a second worker can't double-send.
        const [claimed] = await tx
          .update(users)
          .set({ streakNudgedWeek: thisWeek })
          .where(and(eq(users.id, id), or(isNull(users.streakNudgedWeek), ne(users.streakNudgedWeek, thisWeek))))
          .returning({ id: users.id });
        if (!claimed) return;
        const streak = await streakFor(tx, id, id, now);
        if (streak.current > 0 && !streak.thisWeekDone) {
          await notify(tx, { userId: id, type: 'streak_nudge', actorId: id, count: streak.current });
          sent++;
        }
      });
    }
  }
  return sent;
}
