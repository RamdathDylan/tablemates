/** Feed and restaurant detail: the friends-only reads of reviews. */
import { feedQuery, type Dish, type FeedItem, type Page, type RestaurantDetail, type TopDish } from '@tablemates/shared';
import { and, avg, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { restaurants, reviewDishes, reviews, savedPlaces, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant, toReview } from '../lib/serialize';
import { friendVisitFilter, visibleVisitFilter } from '../lib/visibility';
import { engagementFor } from './engagement';
import { companionsFor, withEssentials } from './visits';
import { dishesFor } from '../lib/dishes';

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
  const [engagement, companions, dishes] = await Promise.all([
    engagementFor(db, viewerId, rows.map((r) => r.review.id)),
    companionsFor(db, rows.map((r) => r.review.visitId)),
    dishesFor(db, rows.map((r) => r.review.id)),
  ]);
  return rows.map((row) => ({
    ...toFeedItem(row, dishes.get(row.review.id)!),
    engagement: engagement.get(row.review.id)!,
    companions: companions.get(row.review.visitId)!,
  }));
}

const toFeedItem = (row: FeedRow, dishes: Dish[]): Omit<FeedItem, 'engagement' | 'companions'> => ({
  review: toReview(row.review, dishes),
  visitedAt: row.visitedAt,
  author: toPublicUser(row.author),
  restaurant: toRestaurant(row.restaurant),
  saved: row.saved,
});

/** Dishes from the reviews the viewer can see here, grouped by normalized name. */
async function topDishes(db: Db, viewerId: string, restaurantId: string): Promise<TopDish[]> {
  const rows = await db
    .select({
      name: reviewDishes.name,
      key: reviewDishes.nameKey,
      rating: reviewDishes.rating,
      person: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
    })
    .from(reviewDishes)
    .innerJoin(reviews, eq(reviewDishes.reviewId, reviews.id))
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .innerJoin(users, eq(visits.userId, users.id))
    .where(and(eq(visits.restaurantId, restaurantId), visibleVisitFilter(viewerId)));

  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
  return [...groups.values()]
    .map((g) => {
      const ratings = g.flatMap((r) => (r.rating ? [r.rating] : []));
      // Show the spelling people used most; on a tie, the one with the least punctuation.
      const spellings = new Map<string, number>();
      for (const r of g) spellings.set(r.name, (spellings.get(r.name) ?? 0) + 1);
      const noise = (name: string) => name.replace(/[A-Za-z0-9 ]/g, '').length;
      const people = [...new Map(g.map((r) => [r.person.id, r.person])).values()];
      return {
        name: [...spellings.entries()].sort((a, b) => b[1] - a[1] || noise(a[0]) - noise(b[0]))[0]![0],
        orders: g.length,
        averageRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
        people: people.slice(0, 3).map(toPublicUser),
      };
    })
    .sort((a, b) => b.orders - a.orders || (b.averageRating ?? 0) - (a.averageRating ?? 0))
    .slice(0, 8);
}

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
    const [rows, [stats], [saved], dishes] = await Promise.all([
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
      topDishes(db, req.userId, id),
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
      topDishes: dishes,
    };
  });
}
