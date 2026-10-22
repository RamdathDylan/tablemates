import {
  feedQuery,
  markNotificationsReadInput,
  type NotificationItem,
  type NotificationSummary,
  type Page,
} from '@tablemates/shared';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { asks, challenges, comments, friendships, notifications, plans, restaurants, tables, users } from '../db/schema';
import type { Deps } from '../deps';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { badgeTitle } from '../lib/badges';
import { parse } from '../lib/errors';
import { toPublicUser } from '../lib/serialize';

export function notificationRoutes(app: FastifyInstance, { db }: Deps) {
  /** Polled by the app for the Friends badge and "request accepted" alerts. */
  app.get('/notifications/summary', async (req): Promise<NotificationSummary> => {
    const [[pending], [unread], accepted] = await Promise.all([
      db
        .select({ n: count() })
        .from(friendships)
        .where(and(eq(friendships.addresseeId, req.userId), eq(friendships.status, 'pending'))),
      db
        .select({ n: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, req.userId), isNull(notifications.readAt))),
      db
        .select({
          id: notifications.id,
          createdAt: notifications.createdAt,
          user: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            avatarUrl: users.avatarUrl,
          },
        })
        .from(notifications)
        .innerJoin(users, eq(notifications.actorId, users.id))
        .where(
          and(
            eq(notifications.userId, req.userId),
            eq(notifications.type, 'friend_accepted'),
            isNull(notifications.readAt),
          ),
        )
        .orderBy(asc(notifications.createdAt))
        .limit(20),
    ]);
    return {
      pendingFriendRequests: pending?.n ?? 0,
      unread: unread?.n ?? 0,
      unreadAccepted: accepted.map((a) => ({
        id: a.id,
        user: toPublicUser(a.user),
        createdAt: a.createdAt.toISOString(),
      })),
    };
  });

  /** The activity inbox, newest first. */
  app.get('/notifications', async (req): Promise<Page<NotificationItem>> => {
    const { cursor, limit } = parse(feedQuery, req.query);
    const conditions = [eq(notifications.userId, req.userId)];
    if (cursor) {
      const c = decodeCursor(cursor);
      conditions.push(
        sql`(${notifications.createdAt}, ${notifications.id}) < (${c.createdAt.toISOString()}::timestamptz, ${c.id}::uuid)`,
      );
    }
    const rows = await db
      .select({
        n: notifications,
        actor: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        restaurant: { id: restaurants.id, name: restaurants.name },
        friendshipStatus: friendships.status,
        excerpt: sql<string | null>`coalesce(${comments.body}, ${asks.question}, ${plans.title}, ${tables.emoji} || ' ' || ${tables.name}, ${challenges.title})`,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.actorId, users.id))
      .leftJoin(restaurants, eq(notifications.restaurantId, restaurants.id))
      .leftJoin(friendships, eq(notifications.friendshipId, friendships.id))
      .leftJoin(comments, eq(notifications.commentId, comments.id))
      .leftJoin(asks, eq(notifications.askId, asks.id))
      .leftJoin(plans, eq(notifications.planId, plans.id))
      .leftJoin(tables, eq(notifications.tableId, tables.id))
      .leftJoin(challenges, eq(notifications.challengeId, challenges.id))
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ n, actor, restaurant, friendshipStatus, excerpt }) => ({
        id: n.id,
        type: n.type,
        actor: toPublicUser(actor),
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
        restaurant: restaurant?.id ? restaurant : null,
        reviewId: n.reviewId,
        pendingRequestId: n.type === 'friend_request' && friendshipStatus === 'pending' ? n.friendshipId : null,
        reaction: n.reaction,
        planId: n.planId,
        tableId: n.tableId,
        challengeId: n.challengeId,
        badge: n.badgeKey ? { key: n.badgeKey, title: badgeTitle(n.badgeKey) } : null,
        emoji: n.emoji,
        count: n.count,
        excerpt: excerpt ? (excerpt.length > 80 ? `${excerpt.slice(0, 79)}…` : excerpt) : null,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.n.createdAt, last.n.id) : null,
    };
  });

  app.post('/notifications/read-all', async (req, reply) => {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, req.userId), isNull(notifications.readAt)));
    return reply.status(204).send();
  });

  app.post('/notifications/read', async (req, reply) => {
    const { ids } = parse(markNotificationsReadInput, req.body);
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(notifications.userId, req.userId), inArray(notifications.id, ids), isNull(notifications.readAt)),
      );
    return reply.status(204).send();
  });
}
