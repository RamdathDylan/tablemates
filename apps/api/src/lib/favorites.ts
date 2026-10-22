import type { Favorite } from '@tablemates/shared';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client';
import { favorites, photos, restaurants, reviewPhotos, reviews, visits } from '../db/schema';
import type { Storage } from '../storage/types';
import { badRequest } from './errors';
import { signPhoto } from './photos';
import { toRestaurant } from './serialize';
import { visitsOfFilter } from './visibility';

/** Replaces the pinned favorites. Only places the user has visited can be pinned. */
export async function setFavorites(db: Db, userId: string, restaurantIds: string[]) {
  if (restaurantIds.length) {
    const visited = await db
      .selectDistinct({ id: visits.restaurantId })
      .from(visits)
      .where(and(eq(visits.userId, userId), inArray(visits.restaurantId, restaurantIds)));
    if (visited.length !== restaurantIds.length) throw badRequest('You can only pin places you’ve been to');
  }
  await db.transaction(async (tx) => {
    await tx.delete(favorites).where(eq(favorites.userId, userId));
    if (restaurantIds.length) {
      await tx.insert(favorites).values(restaurantIds.map((restaurantId, i) => ({ userId, restaurantId, position: i + 1 })));
    }
  });
}

/** A user's favorites as the viewer sees them, each with a cover photo the viewer may see. */
export async function favoritesFor(db: Db, storage: Storage, ownerId: string, viewerId: string): Promise<Favorite[]> {
  const rows = await db
    .select({ restaurant: restaurants })
    .from(favorites)
    .innerJoin(restaurants, eq(favorites.restaurantId, restaurants.id))
    .where(eq(favorites.userId, ownerId))
    .orderBy(asc(favorites.position));
  if (!rows.length) return [];
  // Latest photo from the owner's own reviews of each place, respecting visit audiences.
  const covers = await db
    .select({ restaurantId: visits.restaurantId, photo: photos })
    .from(reviewPhotos)
    .innerJoin(photos, eq(reviewPhotos.photoId, photos.id))
    .innerJoin(reviews, eq(reviewPhotos.reviewId, reviews.id))
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(and(visitsOfFilter(ownerId, viewerId), inArray(visits.restaurantId, rows.map((r) => r.restaurant.id))))
    .orderBy(desc(visits.visitedAt), asc(reviewPhotos.position));
  const cover = new Map<string, typeof photos.$inferSelect>();
  for (const c of covers) if (!cover.has(c.restaurantId)) cover.set(c.restaurantId, c.photo);
  return Promise.all(
    rows.map(async ({ restaurant }) => {
      const photo = cover.get(restaurant.id);
      return { restaurant: toRestaurant(restaurant), photo: photo ? await signPhoto(storage, photo) : null };
    }),
  );
}
