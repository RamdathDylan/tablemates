/** "Tonight" stories: 24-hour photo posts for friends (or just close friends). */
import { storyInput, storyReactionInput, type StoryGroup } from '@tablemates/shared';
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { photos, restaurants, stories, storyViews, users } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { ownReadyPhotos, signPhoto } from '../lib/photos';
import { toPublicUser } from '../lib/serialize';
import { friendContentFilter } from '../lib/visibility';
import type { Storage } from '../storage/types';
import { ensureRestaurant } from './visits';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };

/** Stories the viewer may see: their own, plus friends' whose audience includes them. */
function visibleStories(viewerId: string) {
  return or(
    eq(stories.authorId, viewerId),
    friendContentFilter(stories.authorId, stories.audience, viewerId),
  )!;
}

async function visibleStory(db: Db, viewerId: string, storyId: string) {
  const [story] = await db
    .select()
    .from(stories)
    .where(and(eq(stories.id, storyId), gt(stories.expiresAt, new Date()), visibleStories(viewerId)));
  if (!story) throw notFound('Story not found');
  return story;
}

/** Deletes expired stories and their photos. Run by the job runner. */
export async function expireStories(db: Db, storage: Storage, now = new Date()) {
  // Deleting the photo rows claims them, so only one instance acts on each;
  // the delete cascades to the stories and their views. Objects are removed
  // after the rows, so a crash leaves at most an orphaned object, never a
  // story pointing at a missing photo.
  const expired = await db
    .delete(photos)
    .where(inArray(photos.id, db.select({ id: stories.photoId }).from(stories).where(lt(stories.expiresAt, now))))
    .returning({ key: photos.storageKey });
  if (expired.length) await storage.delete(expired.map((e) => e.key));
  return expired.length;
}

export function storyRoutes(app: FastifyInstance, { db, storage, places }: Deps) {
  /** Your stories first, then friends with unseen stories (newest first), then the rest. */
  app.get('/stories', async (req): Promise<StoryGroup[]> => {
    const rows = await db
      .select({ story: stories, author: userColumns, photo: photos, restaurant: { id: restaurants.id, name: restaurants.name }, seenAt: storyViews.viewedAt })
      .from(stories)
      .innerJoin(users, eq(stories.authorId, users.id))
      .innerJoin(photos, eq(stories.photoId, photos.id))
      .leftJoin(restaurants, eq(stories.restaurantId, restaurants.id))
      .leftJoin(storyViews, and(eq(storyViews.storyId, stories.id), eq(storyViews.viewerId, req.userId)))
      .where(and(gt(stories.expiresAt, new Date()), visibleStories(req.userId)))
      .orderBy(asc(stories.createdAt));

    const groups = new Map<string, StoryGroup & { latest: string }>();
    for (const r of rows) {
      const g =
        groups.get(r.author.id) ??
        groups
          .set(r.author.id, { author: toPublicUser(r.author), stories: [], allSeen: true, isMine: r.author.id === req.userId, latest: '' })
          .get(r.author.id)!;
      const seen = r.author.id === req.userId || r.seenAt !== null;
      g.stories.push({
        id: r.story.id,
        photo: await signPhoto(storage, r.photo),
        restaurant: r.restaurant?.id ? r.restaurant : null,
        caption: r.story.caption,
        audience: r.story.audience,
        createdAt: r.story.createdAt.toISOString(),
        expiresAt: r.story.expiresAt.toISOString(),
        seen,
      });
      g.allSeen &&= seen;
      g.latest = r.story.createdAt.toISOString();
    }
    return [...groups.values()]
      .sort((a, b) => Number(b.isMine) - Number(a.isMine) || Number(a.allSeen) - Number(b.allSeen) || b.latest.localeCompare(a.latest))
      .map(({ latest: _, ...g }) => g);
  });

  app.post('/stories', async (req, reply) => {
    const input = parse(storyInput, req.body);
    await ownReadyPhotos(db, req.userId, [input.photoId], 'story');
    let restaurantId = input.restaurantId ?? null;
    if (!restaurantId && input.googlePlaceId) restaurantId = (await ensureRestaurant(db, places, input.googlePlaceId)).id;
    const [story] = await db
      .insert(stories)
      .values({
        authorId: req.userId,
        photoId: input.photoId,
        restaurantId,
        caption: input.caption,
        audience: input.audience,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      })
      .returning({ id: stories.id });
    reply.status(201);
    return story;
  });

  app.post('/stories/:id/view', async (req, reply) => {
    const story = await visibleStory(db, req.userId, idParam(req.params));
    if (story.authorId !== req.userId) {
      await db.insert(storyViews).values({ storyId: story.id, viewerId: req.userId }).onConflictDoNothing();
    }
    return reply.status(204).send();
  });

  /** Who has seen your story, most recent first. */
  app.get('/stories/:id/viewers', async (req) => {
    const story = await visibleStory(db, req.userId, idParam(req.params));
    if (story.authorId !== req.userId) throw forbidden('Only you can see who viewed your story');
    const rows = await db
      .select({ user: userColumns, viewedAt: storyViews.viewedAt })
      .from(storyViews)
      .innerJoin(users, eq(storyViews.viewerId, users.id))
      .where(eq(storyViews.storyId, story.id))
      .orderBy(desc(storyViews.viewedAt));
    return rows.map((r) => ({ user: toPublicUser(r.user), viewedAt: r.viewedAt.toISOString() }));
  });

  app.post('/stories/:id/react', async (req, reply) => {
    const story = await visibleStory(db, req.userId, idParam(req.params));
    const { emoji } = parse(storyReactionInput, req.body);
    await notify(db, {
      userId: story.authorId,
      type: 'story_reaction',
      actorId: req.userId,
      restaurantId: story.restaurantId ?? undefined,
      emoji,
    });
    return reply.status(204).send();
  });

  app.delete('/stories/:id', async (req, reply) => {
    const [story] = await db
      .select({ photoId: stories.photoId, key: photos.storageKey })
      .from(stories)
      .innerJoin(photos, eq(stories.photoId, photos.id))
      .where(and(eq(stories.id, idParam(req.params)), eq(stories.authorId, req.userId)));
    if (!story) throw notFound('Story not found');
    await storage.delete([story.key]);
    await db.delete(photos).where(eq(photos.id, story.photoId));
    return reply.status(204).send();
  });
}
