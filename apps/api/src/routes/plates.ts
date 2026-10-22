/** Plate check (BeReal-style): one surprise moment a day to show what's on your plate. */
import { plateInput, type PlatePost, type PlateToday } from '@tablemates/shared';
import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { photos, platePosts, platePrompts, restaurants, users } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, isUniqueViolation, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { ownReadyPhotos, signPhoto } from '../lib/photos';
import { toPublicUser } from '../lib/serialize';
import { friendIdsOf } from '../lib/visibility';
import { localDate, zonedTimeToUtc } from '../lib/zoned';
import type { Storage } from '../storage/types';
import { ensureRestaurant } from './visits';

export const ON_TIME_MS = 5 * 60 * 1000;
/** Prompts land between 11:30 and 20:30 local time. */
const WINDOW_START = 11 * 60 + 30;
const WINDOW_END = 20 * 60 + 30;

/**
 * Job: makes sure every time zone with users has today's prompt (at a random
 * local time in the window), then notifies users when their prompt arrives.
 */
export async function runPlatePrompts(db: Db, now = new Date(), random = Math.random) {
  const zones = await db.selectDistinct({ tz: users.timezone }).from(users);
  for (const { tz } of zones) {
    const date = localDate(tz, now);
    const minute = WINDOW_START + Math.floor(random() * (WINDOW_END - WINDOW_START));
    await db
      .insert(platePrompts)
      .values({ timezone: tz, localDate: date, promptAt: zonedTimeToUtc(date, Math.floor(minute / 60), minute % 60, tz) })
      .onConflictDoNothing();
  }

  const due = await db
    .select()
    .from(platePrompts)
    .where(and(isNull(platePrompts.notifiedAt), lte(platePrompts.promptAt, now)));
  for (const prompt of due) {
    await db.transaction(async (tx) => {
      // Claim it first so a second worker can't double-send.
      const [claimed] = await tx
        .update(platePrompts)
        .set({ notifiedAt: now })
        .where(and(eq(platePrompts.id, prompt.id), isNull(platePrompts.notifiedAt)))
        .returning({ id: platePrompts.id });
      if (!claimed) return;
      // Prompts more than an hour old (e.g. after downtime) are marked done without alerting.
      if (now.getTime() - prompt.promptAt.getTime() > 60 * 60 * 1000) return;
      const people = await tx.select({ id: users.id }).from(users).where(eq(users.timezone, prompt.timezone));
      await notify(tx, people.map((p) => ({ userId: p.id, type: 'plate_prompt' as const, actorId: p.id })));
    });
  }
}

async function todaysPrompt(db: Db, timezone: string, now = new Date()) {
  const [prompt] = await db
    .select()
    .from(platePrompts)
    .where(and(eq(platePrompts.timezone, timezone), eq(platePrompts.localDate, localDate(timezone, now)), lte(platePrompts.promptAt, now)));
  return prompt ?? null;
}

async function toPost(storage: Storage, row: { post: typeof platePosts.$inferSelect; user: Parameters<typeof toPublicUser>[0]; photo: typeof photos.$inferSelect; restaurant: { id: string | null; name: string | null } | null }): Promise<PlatePost> {
  return {
    user: toPublicUser(row.user),
    photo: await signPhoto(storage, row.photo),
    restaurant: row.restaurant?.id ? { id: row.restaurant.id, name: row.restaurant.name! } : null,
    postedAt: row.post.postedAt.toISOString(),
    late: row.post.late,
  };
}

export function plateRoutes(app: FastifyInstance, { db, storage, places }: Deps) {
  const select = () =>
    db
      .select({
        post: platePosts,
        user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        photo: photos,
        restaurant: { id: restaurants.id, name: restaurants.name },
      })
      .from(platePosts)
      .innerJoin(users, eq(platePosts.userId, users.id))
      .innerJoin(photos, eq(platePosts.photoId, photos.id))
      .leftJoin(restaurants, eq(platePosts.restaurantId, restaurants.id));

  app.get('/plates/today', async (req): Promise<PlateToday> => {
    const [me] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, req.userId));
    const prompt = await todaysPrompt(db, me!.timezone);
    const [mine] = prompt ? await select().where(and(eq(platePosts.promptId, prompt.id), eq(platePosts.userId, req.userId))) : [];
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const friendsRecent = and(sql`${platePosts.userId} in (${friendIdsOf(req.userId)})`, gt(platePosts.postedAt, since));
    const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(platePosts).where(friendsRecent)) as [{ n: number }];
    // BeReal rule: you only see friends' plates once you've shared yours.
    const posts = mine ? await select().where(friendsRecent).orderBy(desc(platePosts.postedAt)) : [];
    return {
      prompt: prompt
        ? { id: prompt.id, promptAt: prompt.promptAt.toISOString(), onTimeUntil: new Date(prompt.promptAt.getTime() + ON_TIME_MS).toISOString() }
        : null,
      mine: mine ? await toPost(storage, mine) : null,
      friendsPosted: n,
      posts: await Promise.all(posts.map((p) => toPost(storage, p))),
    };
  });

  app.post('/plates', async (req, reply) => {
    const input = parse(plateInput, req.body);
    const [me] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, req.userId));
    const prompt = await todaysPrompt(db, me!.timezone);
    if (!prompt) throw badRequest("Today's plate check hasn't gone off yet");
    await ownReadyPhotos(db, req.userId, [input.photoId], 'plate');
    let restaurantId = input.restaurantId ?? null;
    if (!restaurantId && input.googlePlaceId) restaurantId = (await ensureRestaurant(db, places, input.googlePlaceId)).id;
    try {
      await db.insert(platePosts).values({
        promptId: prompt.id,
        userId: req.userId,
        photoId: input.photoId,
        restaurantId,
        late: Date.now() - prompt.promptAt.getTime() > ON_TIME_MS,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("You've already shared today's plate");
      throw err;
    }
    reply.status(201);
    return { ok: true };
  });
}
