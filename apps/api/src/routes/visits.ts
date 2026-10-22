import {
  createVisitInput,
  reviewInput,
  updateReviewInput,
  type Visit,
} from '@tablemates/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { restaurants, reviews, visits } from '../db/schema';
import type { Deps } from '../deps';
import { conflict, isUniqueViolation, notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toRestaurant, toReview } from '../lib/serialize';
import type { PlacesProvider } from '../places/types';

/** Google's terms allow caching place details for up to 30 days. */
const PLACE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

/** Finds or creates the restaurant row for a Google place, refreshing stale details. */
export async function ensureRestaurant(db: Db, places: PlacesProvider, googlePlaceId: string) {
  const [existing] = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.googlePlaceId, googlePlaceId));
  if (existing && Date.now() - existing.cachedAt.getTime() < PLACE_CACHE_MS) return existing;

  let place;
  try {
    place = await places.get(googlePlaceId);
  } catch (err) {
    // Stale details are better than failing to log a visit.
    if (existing) return existing;
    throw err;
  }
  if (!place) {
    if (existing) return existing;
    throw notFound('Restaurant not found');
  }

  const values = {
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    priceLevel: place.priceLevel,
    cuisine: place.cuisine,
    cachedAt: new Date(),
  };
  const [row] = await db
    .insert(restaurants)
    .values({ googlePlaceId, ...values })
    .onConflictDoUpdate({ target: restaurants.googlePlaceId, set: values })
    .returning();
  return row!;
}

/** All of a user's visits. Callers must check visibility first. */
export async function listVisits(db: Db, userId: string): Promise<Visit[]> {
  const rows = await db
    .select({ visit: visits, restaurant: restaurants, review: reviews })
    .from(visits)
    .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
    .leftJoin(reviews, eq(reviews.visitId, visits.id))
    .where(eq(visits.userId, userId))
    .orderBy(desc(visits.visitedAt), desc(visits.createdAt))
    .limit(200);
  return rows.map(({ visit, restaurant, review }) => ({
    id: visit.id,
    visitedAt: visit.visitedAt,
    restaurant: toRestaurant(restaurant),
    review: review ? toReview(review) : null,
  }));
}

export function visitRoutes(app: FastifyInstance, { db, places }: Deps) {
  /** A review the viewer owns, or 404 (so other people's review ids aren't confirmed). */
  async function ownReview(reviewId: string, userId: string) {
    const [row] = await db
      .select({ review: reviews })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(and(eq(reviews.id, reviewId), eq(visits.userId, userId)));
    if (!row) throw notFound('Review not found');
    return row.review;
  }

  app.get('/me/visits', async (req) => listVisits(db, req.userId));

  app.post('/visits', async (req, reply): Promise<Visit> => {
    const input = parse(createVisitInput, req.body);
    const restaurant = await ensureRestaurant(db, places, input.googlePlaceId);
    const result = await db.transaction(async (tx) => {
      const [visit] = await tx
        .insert(visits)
        .values({ userId: req.userId, restaurantId: restaurant.id, visitedAt: input.visitedAt })
        .returning();
      const [review] = input.review
        ? await tx
            .insert(reviews)
            .values({ visitId: visit!.id, ...input.review })
            .returning()
        : [];
      return { visit: visit!, review };
    });
    reply.status(201);
    return {
      id: result.visit.id,
      visitedAt: result.visit.visitedAt,
      restaurant: toRestaurant(restaurant),
      review: result.review ? toReview(result.review) : null,
    };
  });

  app.delete('/visits/:id', async (req, reply) => {
    const [row] = await db
      .delete(visits)
      .where(and(eq(visits.id, idParam(req.params)), eq(visits.userId, req.userId)))
      .returning({ id: visits.id });
    if (!row) throw notFound('Visit not found');
    return reply.status(204).send();
  });

  /** Adds a review to a visit that was logged without one. */
  app.post('/visits/:id/review', async (req, reply) => {
    const visitId = idParam(req.params);
    const input = parse(reviewInput, req.body);
    const [visit] = await db
      .select({ id: visits.id })
      .from(visits)
      .where(and(eq(visits.id, visitId), eq(visits.userId, req.userId)));
    if (!visit) throw notFound('Visit not found');
    try {
      const [review] = await db.insert(reviews).values({ visitId, ...input }).returning();
      reply.status(201);
      return toReview(review!);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('This visit already has a review');
      throw err;
    }
  });

  app.patch('/reviews/:id', async (req) => {
    const review = await ownReview(idParam(req.params), req.userId);
    const input = parse(updateReviewInput, req.body);
    const [updated] = await db
      .update(reviews)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(reviews.id, review.id))
      .returning();
    return toReview(updated!);
  });

  app.delete('/reviews/:id', async (req, reply) => {
    const review = await ownReview(idParam(req.params), req.userId);
    await db.delete(reviews).where(eq(reviews.id, review.id));
    return reply.status(204).send();
  });
}
