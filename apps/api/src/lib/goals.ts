/** Yearly goals: how many new places someone means to try this year. */
import type { Goal } from '@tablemates/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { goals, users, visits } from '../db/schema';
import { notify } from './notify';
import { visitsOfFilter } from './visibility';
import { localDate } from './zoned';

/** Places `owner` first visited in `year`, among the visits `viewer` can see. */
export async function newPlacesIn(db: Pick<Db, 'select'>, ownerId: string, viewerId: string, year: number) {
  const firsts = db
    .select({ first: sql<string>`min(${visits.visitedAt})`.as('first') })
    .from(visits)
    .where(visitsOfFilter(ownerId, viewerId))
    .groupBy(visits.restaurantId)
    .as('firsts');
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(firsts)
    .where(sql`${firsts.first} >= ${`${year}-01-01`} and ${firsts.first} < ${`${year + 1}-01-01`}`);
  return row?.n ?? 0;
}

/** The current year in the owner's time zone. */
export async function currentYearOf(db: Pick<Db, 'select'>, userId: string, now = new Date()) {
  const [u] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, userId));
  return Number(localDate(u?.timezone ?? 'UTC', now).slice(0, 4));
}

export async function goalFor(db: Pick<Db, 'select'>, ownerId: string, viewerId: string, year: number): Promise<Goal | null> {
  const [goal] = await db.select().from(goals).where(and(eq(goals.userId, ownerId), eq(goals.year, year)));
  if (!goal) return null;
  return { year, target: goal.targetNewPlaces, done: await newPlacesIn(db, ownerId, viewerId, year) };
}

/** After a visit is logged: the first time that year's goal is met, celebrate it. */
export async function checkGoalReached(db: Db, userId: string, visitedAt: string) {
  const year = Number(visitedAt.slice(0, 4));
  const goal = await goalFor(db, userId, userId, year);
  if (!goal || goal.done < goal.target) return;
  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(goals)
      .set({ reachedAt: new Date() })
      .where(and(eq(goals.userId, userId), eq(goals.year, year), isNull(goals.reachedAt)))
      .returning({ year: goals.year });
    if (claimed) await notify(tx, { userId, type: 'goal_reached', actorId: userId, count: goal.target });
  });
}
