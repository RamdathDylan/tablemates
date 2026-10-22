import { markNotificationsReadInput, type NotificationSummary } from '@tablemates/shared';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { friendships, notifications, users } from '../db/schema';
import type { Deps } from '../deps';
import { parse } from '../lib/errors';
import { toPublicUser } from '../lib/serialize';

export function notificationRoutes(app: FastifyInstance, { db }: Deps) {
  /** Polled by the app for the Friends badge and "request accepted" alerts. */
  app.get('/notifications/summary', async (req): Promise<NotificationSummary> => {
    const [[pending], accepted] = await Promise.all([
      db
        .select({ n: count() })
        .from(friendships)
        .where(and(eq(friendships.addresseeId, req.userId), eq(friendships.status, 'pending'))),
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
      unreadAccepted: accepted.map((a) => ({
        id: a.id,
        user: toPublicUser(a.user),
        createdAt: a.createdAt.toISOString(),
      })),
    };
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
