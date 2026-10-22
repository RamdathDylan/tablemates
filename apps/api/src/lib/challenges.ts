/** Counting progress in friend challenges, and the job that wraps them up. */
import type { ChallengeMetric } from '@tablemates/shared';
import { and, eq, gte, inArray, isNull, lt, lte } from 'drizzle-orm';

import type { Db } from '../db/client';
import { challengeMembers, challenges, restaurants, reviews, visits } from '../db/schema';
import { evaluateBadges } from './badges';
import { notify } from './notify';
import { sharedWithAllFriends } from './visibility';

type ChallengeRow = typeof challenges.$inferSelect;

/**
 * Each person's count for a challenge. Only visits shared with all friends
 * count: members see each other's totals, so private and close-friends visits
 * never show up as leaderboard activity.
 */
export async function challengeCounts(db: Pick<Db, 'select' | 'selectDistinct'>, challenge: ChallengeRow, userIds: string[]): Promise<Map<string, number>> {
  const counts = new Map(userIds.map((id) => [id, 0]));
  if (!userIds.length) return counts;
  const rows = await db
    .select({ visitId: visits.id, userId: visits.userId, restaurantId: visits.restaurantId, cuisine: restaurants.cuisine, reviewId: reviews.id })
    .from(visits)
    .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
    .leftJoin(reviews, eq(reviews.visitId, visits.id))
    .where(
      and(
        inArray(visits.userId, userIds),
        sharedWithAllFriends(),
        gte(visits.visitedAt, challenge.startsOn),
        lte(visits.visitedAt, challenge.endsOn),
      ),
    );
  // "New" means never visited before the challenge started.
  const before =
    challenge.metric === 'new_places'
      ? new Set(
          (
            await db
              .selectDistinct({ userId: visits.userId, restaurantId: visits.restaurantId })
              .from(visits)
              .where(and(inArray(visits.userId, userIds), lt(visits.visitedAt, challenge.startsOn)))
          ).map((r) => `${r.userId}:${r.restaurantId}`),
        )
      : new Set<string>();

  const sets = new Map<string, Set<string>>();
  for (const r of rows) {
    const keys = METRIC_KEYS[challenge.metric](r, before);
    const set = sets.get(r.userId) ?? sets.set(r.userId, new Set()).get(r.userId)!;
    for (const k of keys) set.add(k);
  }
  for (const [id, set] of sets) counts.set(id, set.size);
  return counts;
}

type Row = { visitId: string; userId: string; restaurantId: string; cuisine: string[]; reviewId: string | null };
/** What each visit contributes; a person's count is the number of distinct keys. */
const METRIC_KEYS: Record<ChallengeMetric, (r: Row, before: Set<string>) => string[]> = {
  visits: (r) => [r.visitId],
  reviews: (r) => (r.reviewId ? [r.reviewId] : []),
  new_places: (r, before) => (before.has(`${r.userId}:${r.restaurantId}`) ? [] : [r.restaurantId]),
  cuisines: (r) => r.cuisine.map((c) => c.toLowerCase()),
};

/** Today as YYYY-MM-DD (UTC); challenge dates are compared by day. */
const today = (now: Date) => now.toISOString().slice(0, 10);

/**
 * Marks members who hit the target (challenge_complete), then announces the
 * results of challenges whose last day has passed (challenge_ended) and
 * awards the Champion badge. Run by the job runner.
 */
export async function runChallenges(db: Db, now = new Date()) {
  const live = await db.select().from(challenges).where(isNull(challenges.endedAt));
  for (const c of live) {
    const members = await db
      .select()
      .from(challengeMembers)
      .where(and(eq(challengeMembers.challengeId, c.id), eq(challengeMembers.status, 'joined')));
    const counts = await challengeCounts(db, c, members.map((m) => m.userId));

    for (const m of members) {
      if (m.completedAt || (counts.get(m.userId) ?? 0) < c.target) continue;
      await db.transaction(async (tx) => {
        const [claimed] = await tx
          .update(challengeMembers)
          .set({ completedAt: now })
          .where(and(eq(challengeMembers.challengeId, c.id), eq(challengeMembers.userId, m.userId), isNull(challengeMembers.completedAt)))
          .returning({ id: challengeMembers.userId });
        if (claimed) await notify(tx, { userId: m.userId, type: 'challenge_complete', actorId: m.userId, challengeId: c.id, count: c.target });
      });
    }

    if (c.endsOn >= today(now)) continue;
    const top = Math.max(0, ...counts.values());
    const winners = top > 0 ? members.filter((m) => counts.get(m.userId) === top).map((m) => m.userId) : [];
    const ended = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(challenges)
        .set({ endedAt: now })
        .where(and(eq(challenges.id, c.id), isNull(challenges.endedAt)))
        .returning({ id: challenges.id });
      if (!claimed) return false;
      if (winners.length) {
        await tx
          .update(challengeMembers)
          .set({ won: true })
          .where(and(eq(challengeMembers.challengeId, c.id), inArray(challengeMembers.userId, winners)));
      }
      // Everyone hears who won; with no winner, the alert comes from the creator.
      await notify(
        tx,
        members.map((m) => ({
          userId: m.userId,
          type: 'challenge_ended' as const,
          actorId: winners[0] ?? c.creatorId,
          challengeId: c.id,
          count: top,
        })),
      );
      return true;
    });
    if (ended && winners.length) await evaluateBadges(db, winners);
  }
}

