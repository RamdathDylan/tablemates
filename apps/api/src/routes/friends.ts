import { friendRequestInput, type FriendRequest, type PublicUser } from '@tablemates/shared';
import { and, desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { friendships, users } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, isUniqueViolation, notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser } from '../lib/serialize';

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

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

  app.get('/friends', async (req): Promise<PublicUser[]> => {
    const me = req.userId;
    const rows = await db
      .select(publicColumns)
      .from(friendships)
      .innerJoin(
        users,
        or(
          and(eq(friendships.requesterId, me), eq(users.id, friendships.addresseeId)),
          and(eq(friendships.addresseeId, me), eq(users.id, friendships.requesterId)),
        ),
      )
      .where(eq(friendships.status, 'accepted'))
      .orderBy(users.displayName);
    return rows.map(toPublicUser);
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
      await db
        .update(friendships)
        .set({ status: 'accepted', acceptedAt: new Date() })
        .where(eq(friendships.id, existing.id));
      return { status: 'friends' as const, requestId: existing.id };
    }

    try {
      const [row] = await db
        .insert(friendships)
        .values({ requesterId: req.userId, addresseeId: target.id })
        .returning();
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
      .update(friendships)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(
        and(
          eq(friendships.id, id),
          eq(friendships.addresseeId, req.userId),
          eq(friendships.status, 'pending'),
        ),
      )
      .returning();
    if (!row) throw notFound('Friend request not found');
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
    await db.delete(friendships).where(eq(friendships.id, existing.id));
    return reply.status(204).send();
  });
}
