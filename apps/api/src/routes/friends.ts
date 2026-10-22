import { friendRequestInput, type Friend, type FriendRequest } from '@tablemates/shared';
import { and, desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { closeFriends, friendships, notifications, users } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, isUniqueViolation, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { canSeeActivityOf } from '../lib/visibility';
import { idParam } from '../lib/params';
import { toPublicUser } from '../lib/serialize';

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

/**
 * Accepts a pending request and tells the person who sent it. Returns false if
 * the request was no longer pending (e.g. a concurrent accept got there first).
 */
async function acceptRequest(db: Db, request: { id: string; requesterId: string }, accepterId: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(friendships)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(and(eq(friendships.id, request.id), eq(friendships.status, 'pending')))
      .returning({ id: friendships.id });
    if (!updated) return false;
    // The request is resolved; replace it in the inbox with the acceptance.
    await tx
      .delete(notifications)
      .where(and(eq(notifications.friendshipId, request.id), eq(notifications.type, 'friend_request')));
    await notify(tx, { userId: request.requesterId, type: 'friend_accepted', actorId: accepterId, friendshipId: request.id });
    return true;
  });
}

export function friendRoutes(app: FastifyInstance, { db }: Deps) {
  /** The friendship row between two users, whichever of them sent the request. */
  async function pairRow(a: string, b: string) {
    const [row] = await db
      .select()
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, a), eq(friendships.addresseeId, b)),
          and(eq(friendships.requesterId, b), eq(friendships.addresseeId, a)),
        ),
      );
    return row;
  }

  app.get('/friends', async (req): Promise<Friend[]> => {
    const me = req.userId;
    const rows = await db
      .select({ ...publicColumns, closeFriendSince: closeFriends.createdAt })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, me), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, me), eq(users.id, friendships.requesterId)),
        ),
      )
      .leftJoin(closeFriends, and(eq(closeFriends.ownerId, me), eq(closeFriends.friendId, users.id)))
      .where(eq(friendships.status, 'accepted'))
      .orderBy(users.displayName);
    return rows.map((r) => ({ ...toPublicUser(r), closeFriend: r.closeFriendSince !== null }));
  });

  /** Close friends see visits marked "Close friends". Only accepted friends qualify. */
  app.put('/me/close-friends/:userId', async (req, reply) => {
    const friendId = idParam(req.params, 'userId');
    if (friendId === req.userId || !(await canSeeActivityOf(db, req.userId, friendId))) {
      throw badRequest('Only friends can be close friends');
    }
    await db.insert(closeFriends).values({ ownerId: req.userId, friendId }).onConflictDoNothing();
    return reply.status(204).send();
  });

  app.delete('/me/close-friends/:userId', async (req, reply) => {
    await db
      .delete(closeFriends)
      .where(and(eq(closeFriends.ownerId, req.userId), eq(closeFriends.friendId, idParam(req.params, 'userId'))));
    return reply.status(204).send();
  });

  app.get('/friends/requests', async (req): Promise<FriendRequest[]> => {
    const me = req.userId;
    const rows = await db
      .select({ friendship: friendships, user: publicColumns })
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, me), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, me), eq(users.id, friendships.requesterId)),
        ),
      )
      .where(eq(friendships.status, 'pending'))
      .orderBy(desc(friendships.createdAt));
    return rows.map(({ friendship, user }) => ({
      id: friendship.id,
      user: toPublicUser(user),
      direction: friendship.requesterId === me ? 'outgoing' : 'incoming',
      createdAt: friendship.createdAt.toISOString(),
    }));
  });

  /**
   * Sends a request. If the other person already sent one to you, this accepts it
   * instead of creating a second request.
   */
  app.post('/friends/requests', async (req, reply) => {
    const { username } = parse(friendRequestInput, req.body);
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (!target) throw notFound('User not found');
    if (target.id === req.userId) throw badRequest("You can't add yourself as a friend");

    const existing = await pairRow(req.userId, target.id);
    if (existing?.status === 'accepted') throw conflict('You are already friends');
    if (existing?.requesterId === req.userId) throw conflict('Friend request already sent');
    if (existing) {
      if (!(await acceptRequest(db, existing, req.userId))) throw conflict('You are already friends');
      return { status: 'friends' as const, requestId: existing.id };
    }

    try {
      const row = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(friendships)
          .values({ requesterId: req.userId, addresseeId: target.id })
          .returning();
        await notify(tx, { userId: target.id, type: 'friend_request', actorId: req.userId, friendshipId: created!.id });
        return created;
      });
      reply.status(201);
      return { status: 'outgoing' as const, requestId: row!.id };
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Friend request already exists');
      throw err;
    }
  });

  app.post('/friends/requests/:id/accept', async (req) => {
    const id = idParam(req.params);
    const [row] = await db
      .select()
      .from(friendships)
      .where(
        and(
          eq(friendships.id, id),
          eq(friendships.addresseeId, req.userId),
          eq(friendships.status, 'pending'),
        ),
      );
    if (!row || !(await acceptRequest(db, row, req.userId))) throw notFound('Friend request not found');
    return { status: 'friends' as const };
  });

  /** Declines an incoming request, or cancels one you sent. */
  app.post('/friends/requests/:id/decline', async (req, reply) => {
    const id = idParam(req.params);
    const [row] = await db
      .delete(friendships)
      .where(
        and(
          eq(friendships.id, id),
          eq(friendships.status, 'pending'),
          or(eq(friendships.addresseeId, req.userId), eq(friendships.requesterId, req.userId)),
        ),
      )
      .returning({ id: friendships.id });
    if (!row) throw notFound('Friend request not found');
    return reply.status(204).send();
  });

  app.delete('/friends/:userId', async (req, reply) => {
    const otherId = idParam(req.params, 'userId');
    const existing = await pairRow(req.userId, otherId);
    if (existing?.status !== 'accepted') throw notFound('You are not friends with this user');
    await db.transaction(async (tx) => {
      await tx.delete(friendships).where(eq(friendships.id, existing.id));
      // Re-friending later starts fresh rather than restoring close-friend access.
      await tx
        .delete(closeFriends)
        .where(
          or(
            and(eq(closeFriends.ownerId, req.userId), eq(closeFriends.friendId, otherId)),
            and(eq(closeFriends.ownerId, otherId), eq(closeFriends.friendId, req.userId)),
          ),
        );
    });
    return reply.status(204).send();
  });
}
