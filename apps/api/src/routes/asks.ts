/** "Ask your friends": questions to your friends, answered with restaurant picks. */
import { askInput, askReplyInput, type Ask, type AskReply } from '@tablemates/shared';
import { and, desc, eq, gt, inArray, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { askReplies, asks, restaurants, reviews, savedPlaces, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant } from '../lib/serialize';
import { canSeeActivityOf, friendIdsOf, visibleVisitFilter } from '../lib/visibility';
import { ensureRestaurant } from './visits';

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };

/** An ask the viewer may see: their own, or a friend's. */
async function visibleAsk(db: Db, viewerId: string, askId: string) {
  const [ask] = await db.select().from(asks).where(eq(asks.id, askId));
  if (!ask || !(await canSeeActivityOf(db, viewerId, ask.authorId))) throw notFound('Ask not found');
  return ask;
}

async function repliesFor(db: Db, viewerId: string, askIds: string[]): Promise<Map<string, AskReply[]>> {
  const result = new Map<string, AskReply[]>(askIds.map((id) => [id, []]));
  if (!askIds.length) return result;
  const rows = await db
    .select({ reply: askReplies, author: userColumns, restaurant: restaurants, saved: savedPlaces.userId })
    .from(askReplies)
    .innerJoin(users, eq(askReplies.authorId, users.id))
    .innerJoin(restaurants, eq(askReplies.restaurantId, restaurants.id))
    .leftJoin(savedPlaces, and(eq(savedPlaces.restaurantId, restaurants.id), eq(savedPlaces.userId, viewerId)))
    .where(inArray(askReplies.askId, askIds))
    .orderBy(askReplies.createdAt);
  if (!rows.length) return result;

  // Each replier's latest rating at the place they suggested, only where the viewer may see it.
  const ratings = await db
    .select({ userId: visits.userId, restaurantId: visits.restaurantId, rating: reviews.rating, recommends: reviews.recommends })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(
      and(
        inArray(visits.userId, [...new Set(rows.map((r) => r.reply.authorId))]),
        inArray(visits.restaurantId, [...new Set(rows.map((r) => r.reply.restaurantId))]),
        visibleVisitFilter(viewerId),
      ),
    )
    .orderBy(desc(visits.visitedAt), desc(visits.createdAt));
  const latest = new Map<string, { rating: number; recommends: boolean }>();
  for (const r of ratings) {
    const key = `${r.userId}:${r.restaurantId}`;
    if (!latest.has(key)) latest.set(key, r);
  }

  for (const { reply, author, restaurant, saved } of rows) {
    const own = latest.get(`${reply.authorId}:${reply.restaurantId}`);
    result.get(reply.askId)!.push({
      id: reply.id,
      author: toPublicUser(author),
      restaurant: toRestaurant(restaurant),
      note: reply.note,
      rating: own?.rating ?? null,
      recommends: own?.recommends ?? null,
      createdAt: reply.createdAt.toISOString(),
      saved: saved !== null,
    });
  }
  return result;
}

export function askRoutes(app: FastifyInstance, { db, places }: Deps) {
  /** Open asks from you and your friends, plus your own recently closed ones. */
  app.get('/asks', async (req): Promise<Ask[]> => {
    const now = new Date();
    const rows = await db
      .select({ ask: asks, author: userColumns })
      .from(asks)
      .innerJoin(users, eq(asks.authorId, users.id))
      .where(
        or(
          and(sql`${asks.authorId} in (${friendIdsOf(req.userId)})`, gt(asks.closesAt, now)),
          and(eq(asks.authorId, req.userId), gt(asks.closesAt, new Date(now.getTime() - 7 * 86_400_000))),
        ),
      )
      .orderBy(desc(asks.createdAt))
      .limit(30);
    const replies = await repliesFor(db, req.userId, rows.map((r) => r.ask.id));
    return rows.map(({ ask, author }) => ({
      id: ask.id,
      author: toPublicUser(author),
      question: ask.question,
      areaLabel: ask.areaLabel,
      closesAt: ask.closesAt.toISOString(),
      createdAt: ask.createdAt.toISOString(),
      open: ask.closesAt > now,
      replies: replies.get(ask.id)!,
    }));
  });

  app.post('/asks', async (req, reply) => {
    const input = parse(askInput, req.body);
    const [ask] = await db
      .insert(asks)
      .values({
        authorId: req.userId,
        question: input.question,
        areaLabel: input.areaLabel || null,
        closesAt: new Date(Date.now() + input.days * 86_400_000),
      })
      .returning({ id: asks.id });
    reply.status(201);
    return ask;
  });

  /** Closes an ask early. */
  app.delete('/asks/:id', async (req, reply) => {
    const [row] = await db
      .update(asks)
      .set({ closesAt: new Date() })
      .where(and(eq(asks.id, idParam(req.params)), eq(asks.authorId, req.userId)))
      .returning({ id: asks.id });
    if (!row) throw notFound('Ask not found');
    return reply.status(204).send();
  });

  app.post('/asks/:id/replies', async (req, reply) => {
    const ask = await visibleAsk(db, req.userId, idParam(req.params));
    if (ask.authorId === req.userId) throw badRequest("You can't answer your own ask");
    if (ask.closesAt <= new Date()) throw badRequest('This ask is closed');
    const input = parse(askReplyInput, req.body);

    let restaurantId = input.restaurantId;
    if (!restaurantId) restaurantId = (await ensureRestaurant(db, places, input.googlePlaceId!)).id;
    else {
      const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!exists) throw notFound('Restaurant not found');
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(askReplies)
          .values({ askId: ask.id, authorId: req.userId, restaurantId: restaurantId!, note: input.note })
          .returning({ id: askReplies.id });
        await notify(tx, { userId: ask.authorId, type: 'ask_reply', actorId: req.userId, askId: ask.id, restaurantId });
        return row!;
      });
      reply.status(201);
      return created;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('You already suggested that place');
      throw err;
    }
  });

  app.delete('/asks/:askId/replies/:id', async (req, reply) => {
    const [row] = await db.select().from(askReplies).where(eq(askReplies.id, idParam(req.params)));
    if (!row) throw notFound('Reply not found');
    if (row.authorId !== req.userId) throw forbidden();
    await db.delete(askReplies).where(eq(askReplies.id, row.id));
    return reply.status(204).send();
  });
}
