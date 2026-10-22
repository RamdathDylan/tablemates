/** "Out now": opt-in live check-ins that friends can see until they end or expire. */
import { checkinInput, type Checkin, type CheckinsResponse } from '@tablemates/shared';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { checkins, closeFriends, restaurants, users } from '../db/schema';
import type { Deps } from '../deps';
import { notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { toPublicUser, toRestaurant } from '../lib/serialize';
import { friendContentFilter, friendIdsOf } from '../lib/visibility';
import { ensureRestaurant } from './visits';

const HOUR_MS = 60 * 60 * 1000;
const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };

const active = (now: Date) => and(isNull(checkins.endedAt), gt(checkins.expiresAt, now))!;

/** Friends' check-ins whose audience includes the viewer (same rule as stories). */
function friendsCheckins(viewerId: string) {
  return friendContentFilter(checkins.userId, checkins.audience, viewerId);
}

async function selectCheckins(db: Db, where: ReturnType<typeof and>): Promise<Checkin[]> {
  const rows = await db
    .select({ checkin: checkins, user: userColumns, restaurant: restaurants })
    .from(checkins)
    .innerJoin(users, eq(checkins.userId, users.id))
    .innerJoin(restaurants, eq(checkins.restaurantId, restaurants.id))
    .where(where)
    .orderBy(desc(checkins.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.checkin.id,
    user: toPublicUser(r.user),
    restaurant: toRestaurant(r.restaurant),
    audience: r.checkin.audience,
    createdAt: r.checkin.createdAt.toISOString(),
    expiresAt: r.checkin.expiresAt.toISOString(),
  }));
}

export function checkinRoutes(app: FastifyInstance, { db, places }: Deps) {
  app.get('/checkins', async (req): Promise<CheckinsResponse> => {
    const now = new Date();
    const [[mine], friends] = await Promise.all([
      selectCheckins(db, and(eq(checkins.userId, req.userId), active(now))),
      selectCheckins(db, and(friendsCheckins(req.userId), active(now))),
    ]);
    return { mine: mine ?? null, friends };
  });

  /** Checks in somewhere, replacing any check-in you already had going. */
  app.post('/checkins', async (req, reply) => {
    const input = parse(checkinInput, req.body);
    let restaurantId = input.restaurantId;
    if (restaurantId) {
      const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!exists) throw notFound('Restaurant not found');
    } else {
      restaurantId = (await ensureRestaurant(db, places, input.googlePlaceId!)).id;
    }
    const now = new Date();
    const created = await db.transaction(async (tx) => {
      await tx.update(checkins).set({ endedAt: now }).where(and(eq(checkins.userId, req.userId), active(now)));
      const [row] = await tx
        .insert(checkins)
        .values({ userId: req.userId, restaurantId, audience: input.audience, createdAt: now, expiresAt: new Date(now.getTime() + input.hours * HOUR_MS) })
        .returning();
      if (input.notifyCloseFriends) {
        // Unfriending clears the star, but require friendship too so a stale row can't leak a location.
        const close = await tx
          .select({ id: closeFriends.friendId })
          .from(closeFriends)
          .where(and(eq(closeFriends.ownerId, req.userId), sql`${closeFriends.friendId} in (${friendIdsOf(req.userId)})`));
        await notify(tx, close.map((c) => ({ userId: c.id, type: 'checkin' as const, actorId: req.userId, restaurantId })));
      }
      return row!;
    });
    reply.status(201);
    return { id: created.id };
  });

  app.delete('/checkins/me', async (req, reply) => {
    const now = new Date();
    await db.update(checkins).set({ endedAt: now }).where(and(eq(checkins.userId, req.userId), active(now)));
    return reply.status(204).send();
  });
}
