/** Feed and restaurant detail: the friends-only reads of reviews. */
import { feedQuery, type FeedItem, type Page, type RestaurantDetail } from '@tablemates/shared';
import { and, avg, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { restaurants, reviews, savedPlaces, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant, toReview } from '../lib/serialize';
import { friendVisitFilter, visibleVisitFilter } from '../lib/visibility';
import { engagementFor } from './engagement';
import { companionsFor, withEssentials } from './visits';

async function selectFeedItems(db: Db, viewerId: string, where: SQL | undefined, limit: number) {
  const rows = await db
    .select({
      saved: sql<boolean>`${savedPlaces.userId} is not null`,
      review: reviews,
      visitedAt: visits.visitedAt,
      restaurant: restaurants,
      author: {
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
    .innerJoin(users, eq(visits.userId, users.id))
    .leftJoin(savedPlaces, and(eq(savedPlaces.restaurantId, restaurants.id), eq(savedPlaces.userId, viewerId)))
    .where(where)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit);
  return rows;
}

type FeedRow = Awaited<ReturnType<typeof selectFeedItems>>[number];

/** Serializes rows and attaches reaction/comment counts. */
async function toFeedItems(db: Db, viewerId: string, rows: FeedRow[]): Promise<FeedItem[]> {
  const [engagement, companions] = await Promise.all([
    engagementFor(db, viewerId, rows.map((r) => r.review.id)),
    companionsFor(db, rows.map((r) => r.review.visitId)),
  ]);
  return rows.map((row) => ({
    ...toFeedItem(row),
    engagement: engagement.get(row.review.id)!,
    companions: companions.get(row.review.visitId)!,
  }));
}

const toFeedItem = (row: FeedRow): Omit<FeedItem, 'engagement' | 'companions'> => ({
  review: toReview(row.review),
  visitedAt: row.visitedAt,
  author: toPublicUser(row.author),
  restaurant: toRestaurant(row.restaurant),
  saved: row.saved,
});

export function feedRoutes(app: FastifyInstance, { db, places }: Deps) {
  /** Friends' reviews, newest first. Your own reviews live on your profile. */
  app.get('/feed', async (req): Promise<Page<FeedItem>> => {
    const { cursor, limit } = parse(feedQuery, req.query);
    const conditions = [friendVisitFilter(req.userId)];
    if (cursor) {
      const c = decodeCursor(cursor);
      conditions.push(
        sql`(${reviews.createdAt}, ${reviews.id}) < (${c.createdAt.toISOString()}::timestamptz, ${c.id}::uuid)`,
      );
    }
    const rows = await selectFeedItems(db, req.userId, and(...conditions), limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await toFeedItems(db, req.userId, page),
      nextCursor:
        rows.length > limit && last ? encodeCursor(last.review.createdAt, last.review.id) : null,
    };
  });

  app.get('/restaurants/:id', async (req): Promise<RestaurantDetail> => {
    const id = idParam(req.params);
    const [row] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!row) throw notFound('Restaurant not found');
    const restaurant = await withEssentials(db, places, row);

    const visible = and(eq(visits.restaurantId, id), visibleVisitFilter(req.userId));
    const [rows, [stats], [saved]] = await Promise.all([
      selectFeedItems(db, req.userId, visible, 50),
      db
        .select({
          visits: count(visits.id),
          recommends: count(sql`case when ${reviews.recommends} then 1 end`),
          averageRating: avg(reviews.rating),
        })
        .from(visits)
        .leftJoin(reviews, eq(reviews.visitId, visits.id))
        .where(visible),
      db
        .select({ at: savedPlaces.createdAt })
        .from(savedPlaces)
        .where(and(eq(savedPlaces.userId, req.userId), eq(savedPlaces.restaurantId, id))),
    ]);
    return {
      restaurant: toRestaurant(restaurant),
      reviews: await toFeedItems(db, req.userId, rows),
      friendStats: {
        visits: stats?.visits ?? 0,
        recommends: stats?.recommends ?? 0,
        averageRating: stats?.averageRating ? Number(Number(stats.averageRating).toFixed(1)) : null,
      },
      saved: !!saved,
    };
  });
}
