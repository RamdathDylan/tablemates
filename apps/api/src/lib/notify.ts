import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { notifications, savedPlaces, visits } from '../db/schema';
import { visitVisibleTo } from './visibility';

/** A transaction or the db itself. */
type Tx = Pick<Db, 'insert' | 'select' | 'delete'>;

type NotificationType = (typeof notifications.$inferInsert)['type'];

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  actorId: string;
  friendshipId?: string;
  reviewId?: string;
  restaurantId?: string;
  commentId?: string;
  visitId?: string;
  askId?: string;
  planId?: string;
  tableId?: string;
  challengeId?: string;
  badgeKey?: string;
  emoji?: string;
  count?: number;
  reaction?: 'yum' | 'going';
}

/** Alerts about your own account, where you are both the actor and the recipient. */
const SYSTEM_TYPES = new Set<NotificationType>(['badge', 'plate_prompt', 'streak_nudge', 'goal_reached', 'challenge_complete', 'challenge_ended']);

/**
 * The one way to put something in someone's activity inbox. Run it inside the
 * transaction that caused it, so the alert and the change commit together.
 * Push delivery will hook in here.
 */
export async function notify(tx: Tx, input: NotifyInput | NotifyInput[]) {
  // You don't notify yourself, except for system alerts about your own account.
  const rows = (Array.isArray(input) ? input : [input]).filter(
    (n) => n.userId !== n.actorId || SYSTEM_TYPES.has(n.type),
  );
  if (rows.length) await tx.insert(notifications).values(rows);
}

/**
 * Tells everyone who saved this restaurant, and can see the new review, that a
 * friend just reviewed it. Uses the same audience rules as the feed.
 */
export async function notifySaversOfReview(tx: Tx, visitId: string, reviewId: string) {
  const [visit] = await tx.select({ userId: visits.userId, restaurantId: visits.restaurantId }).from(visits).where(eq(visits.id, visitId));
  if (!visit) return;
  const savers = await tx
    .select({ userId: savedPlaces.userId })
    .from(savedPlaces)
    .where(and(eq(savedPlaces.restaurantId, visit.restaurantId), visitVisibleTo(visitId, savedPlaces.userId)));
  await notify(
    tx,
    savers.map((s) => ({
      userId: s.userId,
      type: 'saved_place_reviewed' as const,
      actorId: visit.userId,
      reviewId,
      restaurantId: visit.restaurantId,
    })),
  );
}
