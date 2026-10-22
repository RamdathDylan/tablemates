/**
 * Badges and the passport. Each badge is a counted metric and a target;
 * evaluation runs after the events that can change a metric and records
 * newly earned badges exactly once.
 */
import type { Badge } from '@tablemates/shared';
import { and, count, countDistinct, eq, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { challengeMembers, restaurants, reviews, savedPlaces, userBadges, visits } from '../db/schema';
import { notify } from './notify';
import { friendIdsOf } from './visibility';

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
  { key: 'tastemaker', title: 'Tastemaker', description: 'Friends saved 10 places you recommended', icon: 'sparkles', metric: 'tastemaker', target: 10 },
  { key: 'challenge_winner', title: 'Champion', description: 'Win a friend challenge', icon: 'medal', metric: 'challenge_wins', target: 1 },
];

export const badgeTitle = (key: string) => BADGES.find((b) => b.key === key)?.title ?? 'a badge';

type Reader = Pick<Db, 'select' | 'selectDistinct' | 'execute'>;

async function metrics(db: Reader, userId: string): Promise<Record<Metric, number>> {
  const mine = eq(visits.userId, userId);
  const [[places], cuisines, [regular], [neighborhoods], [trailblazer], [tastemaker], [wins]] = await Promise.all([
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
    // Reviews of yours that no current friend had reviewed before you.
    db
      .select({ n: count() })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(
        and(
          mine,
          sql`not exists (
            select 1 from ${reviews} r2 join ${visits} v2 on v2.id = r2.visit_id
            where v2.restaurant_id = ${visits.restaurantId}
              and v2.user_id in (${friendIdsOf(userId)})
              and r2.created_at < ${reviews.createdAt})`,
        ),
      ),
    // Distinct (friend, place) saves of places you recommended.
    db
      .select({ n: count() })
      .from(savedPlaces)
      .where(
        and(
          sql`${savedPlaces.userId} in (${friendIdsOf(userId)})`,
          sql`${savedPlaces.restaurantId} in (
            select v3.restaurant_id from ${reviews} r3 join ${visits} v3 on v3.id = r3.visit_id
            where v3.user_id = ${userId} and r3.recommends)`,
        ),
      ),
    db.select({ n: count() }).from(challengeMembers).where(and(eq(challengeMembers.userId, userId), eq(challengeMembers.won, true))),
  ]);
  return {
    places: places?.n ?? 0,
    cuisines: Number([...cuisines][0]?.n ?? 0),
    regular: regular?.n ?? 0,
    neighborhoods: neighborhoods?.n ?? 0,
    trailblazer: trailblazer?.n ?? 0,
    tastemaker: tastemaker?.n ?? 0,
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

/** Friends who recommended a place: the people whose Tastemaker count a save can change. */
export async function recommendersAmongFriends(db: Reader, saverId: string, restaurantId: string) {
  const rows = await db
    .selectDistinct({ userId: visits.userId })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(and(eq(visits.restaurantId, restaurantId), eq(reviews.recommends, true), sql`${visits.userId} in (${friendIdsOf(saverId)})`));
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
