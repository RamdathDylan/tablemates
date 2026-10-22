/** Feed and restaurant detail: the friends-only reads of reviews. */
import { feedQuery, type FeedItem, type Page, type RestaurantDetail } from '@tablemates/shared';
import { and, avg, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { restaurants, reviews, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant, toReview } from '../lib/serialize';
import { friendAuthorFilter, visibleAuthorFilter } from '../lib/visibility';

async function selectFeedItems(db: Db, where: SQL | undefined, limit: number) {
  const rows = await db
    .select({
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
    .where(where)
    .orderBy(desc(reviews.createdAt), desc(reviews.id))
    .limit(limit);
  return rows;
}

const toFeedItem = (row: Awaited<ReturnType<typeof selectFeedItems>>[number]): FeedItem => ({
  review: toReview(row.review),
  visitedAt: row.visitedAt,
  author: toPublicUser(row.author),
  restaurant: toRestaurant(row.restaurant),
});

export function feedRoutes(app: FastifyInstance, { db }: Deps) {
  /** Friends' reviews, newest first. Your own reviews live on your profile. */
  app.get('/feed', async (req): Promise<Page<FeedItem>> => {
    const { cursor, limit } = parse(feedQuery, req.query);
    const conditions = [friendAuthorFilter(visits.userId, req.userId)];
    if (cursor) {
      const c = decodeCursor(cursor);
      conditions.push(
        sql`(${reviews.createdAt}, ${reviews.id}) < (${c.createdAt.toISOString()}::timestamptz, ${c.id}::uuid)`,
      );
    }
    const rows = await selectFeedItems(db, and(...conditions), limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toFeedItem),
      nextCursor:
        rows.length > limit && last ? encodeCursor(last.review.createdAt, last.review.id) : null,
    };
  });

  app.get('/restaurants/:id', async (req): Promise<RestaurantDetail> => {
    const id = idParam(req.params);
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, id));
    if (!restaurant) throw notFound('Restaurant not found');

    const visible = and(
      eq(visits.restaurantId, id),
      visibleAuthorFilter(visits.userId, req.userId),
    );
    const [rows, [stats]] = await Promise.all([
      selectFeedItems(db, visible, 50),
      db
        .select({
          visits: count(visits.id),
          recommends: count(sql`case when ${reviews.recommends} then 1 end`),
          averageRating: avg(reviews.rating),
        })
        .from(visits)
        .leftJoin(reviews, eq(reviews.visitId, visits.id))
        .where(visible),
    ]);
    return {
      restaurant: toRestaurant(restaurant),
      reviews: rows.map(toFeedItem),
      friendStats: {
        visits: stats?.visits ?? 0,
        recommends: stats?.recommends ?? 0,
        averageRating: stats?.averageRating ? Number(Number(stats.averageRating).toFixed(1)) : null,
      },
    };
  });
}
