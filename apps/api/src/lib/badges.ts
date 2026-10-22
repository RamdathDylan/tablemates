/**
 * Badges and the passport. Each badge is a counted metric and a target;
 * evaluation runs after the events that can change a metric and records
 * newly earned badges exactly once.
 */
import type { Badge } from '@tablemates/shared';
import { and, count, countDistinct, eq, inArray, max, min, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { challengeMembers, restaurants, reviews, userBadges, visits } from '../db/schema';
import { notify } from './notify';
import { friendIdsOf, friendVisitFilter } from './visibility';

type Metric = 'cuisines' | 'places' | 'regular' | 'neighborhoods' | 'trailblazer' | 'tastemaker' | 'challenge_wins';

interface Definition {
  key: string;
  title: string;
  description: string;
  icon: string;
  metric: Metric;
  target: number;
}

export const BADGES: Definition[] = [
  { key: 'places_10', title: 'Explorer', description: 'Visit 10 different places', icon: 'compass', metric: 'places', target: 10 },
  { key: 'places_50', title: 'Globetrotter', description: 'Visit 50 different places', icon: 'earth', metric: 'places', target: 50 },
  { key: 'century', title: 'Century', description: 'Visit 100 different places', icon: 'trophy', metric: 'places', target: 100 },
  { key: 'cuisine_5', title: 'Curious Palate', description: 'Try 5 cuisines', icon: 'restaurant', metric: 'cuisines', target: 5 },
  { key: 'cuisine_10', title: 'Cuisine Explorer', description: 'Try 10 cuisines', icon: 'fast-food', metric: 'cuisines', target: 10 },
  { key: 'cuisine_25', title: 'World Kitchen', description: 'Try 25 cuisines', icon: 'globe', metric: 'cuisines', target: 25 },
  { key: 'regular', title: 'Regular', description: 'Visit the same place 5 times', icon: 'repeat', metric: 'regular', target: 5 },
  { key: 'neighborhoods_5', title: 'Neighborhood Passport', description: 'Eat in 5 neighborhoods', icon: 'map', metric: 'neighborhoods', target: 5 },
  { key: 'trailblazer', title: 'Trailblazer', description: 'Be the first of your friends to review a place', icon: 'flag', metric: 'trailblazer', target: 1 },
  { key: 'tastemaker', title: 'Tastemaker', description: 'Friends visited 10 places you recommended', icon: 'sparkles', metric: 'tastemaker', target: 10 },
  { key: 'challenge_winner', title: 'Champion', description: 'Win a friend challenge', icon: 'medal', metric: 'challenge_wins', target: 1 },
];

export const badgeTitle = (key: string) => BADGES.find((b) => b.key === key)?.title ?? 'a badge';

type Reader = Pick<Db, 'select' | 'selectDistinct' | 'execute'>;

/**
 * Your reviews where no friend's review that you can see came first. Friends'
 * reviews you can't see (private, or close friends only) are ignored, so the
 * badge never reveals that one exists.
 */
async function trailblazerCount(db: Reader, userId: string) {
  const [mine, friendsFirst] = await Promise.all([
    db
      .select({ restaurantId: visits.restaurantId, at: reviews.createdAt })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(eq(visits.userId, userId)),
    db
      .select({ restaurantId: visits.restaurantId, at: min(reviews.createdAt) })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(friendVisitFilter(userId))
      .groupBy(visits.restaurantId),
  ]);
  const first = new Map(friendsFirst.map((f) => [f.restaurantId, f.at]));
  return mine.filter((r) => {
    const theirs = first.get(r.restaurantId);
    return !theirs || theirs >= r.at;
  }).length;
}

/**
 * Distinct (friend, place) pairs where a friend logged a visit after you
 * recommended the place, counting only visits you can see. Friends' private
 * want-to-try lists are never read.
 */
async function tastemakerCount(db: Reader, userId: string) {
  const recommended = await db
    .select({ restaurantId: visits.restaurantId, since: min(reviews.createdAt) })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(and(eq(visits.userId, userId), eq(reviews.recommends, true)))
    .groupBy(visits.restaurantId);
  if (!recommended.length) return 0;
  const since = new Map(recommended.map((r) => [r.restaurantId, r.since]));
  const followed = await db
    .select({ restaurantId: visits.restaurantId, last: max(visits.createdAt) })
    .from(visits)
    .where(and(friendVisitFilter(userId), inArray(visits.restaurantId, [...since.keys()])))
    .groupBy(visits.userId, visits.restaurantId);
  return followed.filter((f) => {
    const recommendedAt = since.get(f.restaurantId);
    return f.last !== null && recommendedAt !== null && recommendedAt !== undefined && f.last > recommendedAt;
  }).length;
}

async function metrics(db: Reader, userId: string): Promise<Record<Metric, number>> {
  const mine = eq(visits.userId, userId);
  const [[places], cuisines, [regular], [neighborhoods], trailblazer, tastemaker, [wins]] = await Promise.all([
    db.select({ n: countDistinct(visits.restaurantId) }).from(visits).where(mine),
    db.execute<{ n: number }>(sql`
      select count(distinct c)::int as n
      from ${visits} v join ${restaurants} r on r.id = v.restaurant_id, unnest(r.cuisine) c
      where v.user_id = ${userId}`),
    db
      .select({ n: sql<number>`coalesce(max(cnt), 0)::int` })
      .from(db.select({ cnt: count().as('cnt') }).from(visits).where(mine).groupBy(visits.restaurantId).as('per_place')),
    db
      .select({ n: countDistinct(restaurants.neighborhood) })
      .from(visits)
      .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
      .where(mine),
    trailblazerCount(db, userId),
    tastemakerCount(db, userId),
    db.select({ n: count() }).from(challengeMembers).where(and(eq(challengeMembers.userId, userId), eq(challengeMembers.won, true))),
  ]);
  return {
    places: places?.n ?? 0,
    cuisines: Number([...cuisines][0]?.n ?? 0),
    regular: regular?.n ?? 0,
    neighborhoods: neighborhoods?.n ?? 0,
    trailblazer,
    tastemaker,
    challenge_wins: wins?.n ?? 0,
  };
}

/** Records any newly earned badges for each user and announces them. */
export async function evaluateBadges(db: Db, userIds: string[]) {
  for (const userId of new Set(userIds)) {
    const m = await metrics(db, userId);
    const earned = BADGES.filter((b) => m[b.metric] >= b.target);
    if (!earned.length) continue;
    await db.transaction(async (tx) => {
      const added = await tx
        .insert(userBadges)
        .values(earned.map((b) => ({ userId, badgeKey: b.key })))
        .onConflictDoNothing()
        .returning({ key: userBadges.badgeKey });
      await notify(tx, added.map((a) => ({ userId, type: 'badge' as const, actorId: userId, badgeKey: a.key })));
    });
  }
}

/** Friends who recommended a place: the people whose Tastemaker count a visit there can change. */
export async function recommendersAmongFriends(db: Reader, visitorId: string, restaurantId: string) {
  const rows = await db
    .selectDistinct({ userId: visits.userId })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(and(eq(visits.restaurantId, restaurantId), eq(reviews.recommends, true), sql`${visits.userId} in (${friendIdsOf(visitorId)})`));
  return rows.map((r) => r.userId);
}

/** A passport: every badge with earned date, plus progress when it's your own. */
export async function passport(db: Db, userId: string, withProgress: boolean): Promise<Badge[]> {
  const [rows, m] = await Promise.all([
    db.select().from(userBadges).where(eq(userBadges.userId, userId)),
    withProgress ? metrics(db, userId) : Promise.resolve(null),
  ]);
  const earnedAt = new Map(rows.map((r) => [r.badgeKey, r.earnedAt.toISOString()]));
  return BADGES.filter((b) => withProgress || earnedAt.has(b.key)).map((b) => ({
    key: b.key,
    title: b.title,
    description: b.description,
    icon: b.icon,
    earnedAt: earnedAt.get(b.key) ?? null,
    progress: m ? { current: Math.min(m[b.metric], b.target), target: b.target } : null,
  }));
}

// Re-exported for tests that want to inspect raw counts.
export { metrics as badgeMetrics };
