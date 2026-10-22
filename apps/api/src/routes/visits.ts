import {
  createVisitInput,
  type PlaceResult,
  reviewInput,
  updateReviewInput,
  updateVisitInput,
  type PublicUser,
  type TaggedVisit,
  type Visit,
} from '@tablemates/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { notifications, restaurants, reviews, users, visitCompanions, visits } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, isUniqueViolation, notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant, toReview } from '../lib/serialize';
import { evaluateBadges } from '../lib/badges';
import { checkGoalReached } from '../lib/goals';
import { watchMayorship } from '../lib/mayors';
import { dishesFor, setDishes } from '../lib/dishes';
import { photosFor, setReviewPhotos } from '../lib/photos';
import { notify, notifySaversOfReview } from '../lib/notify';
import { audienceAdmits, relationshipsWith, visitsOfFilter } from '../lib/visibility';
import type { PlacesProvider } from '../places/types';
import type { Storage } from '../storage/types';

/** Google's terms allow caching place details for up to 30 days. */
const PLACE_CACHE_MS = 30 * 24 * 60 * 60 * 1000;

/** Columns to store for a Places details result. */
function placeValues(place: PlaceResult) {
  return {
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    priceLevel: place.priceLevel,
    cuisine: place.cuisine,
    openingHours: place.hours ?? null,
    utcOffsetMinutes: place.utcOffsetMinutes ?? null,
    phone: place.phone ?? null,
    website: place.website ?? null,
    mapsUrl: place.mapsUrl ?? null,
    neighborhood: place.neighborhood ?? null,
    detailsFetchedAt: new Date(),
    cachedAt: new Date(),
  };
}

/**
 * Restaurants saved before essentials (hours, phone, website) existed get them
 * the first time their page loads. Failures just leave the old row.
 */
export async function withEssentials(db: Db, places: PlacesProvider, row: typeof restaurants.$inferSelect) {
  if (row.detailsFetchedAt && Date.now() - row.detailsFetchedAt.getTime() < PLACE_CACHE_MS) return row;
  try {
    const place = await places.get(row.googlePlaceId);
    if (!place) return row;
    const [updated] = await db.update(restaurants).set(placeValues(place)).where(eq(restaurants.id, row.id)).returning();
    return updated ?? row;
  } catch {
    return row;
  }
}

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

  const values = placeValues(place);
  const [row] = await db
    .insert(restaurants)
    .values({ googlePlaceId, ...values })
    .onConflictDoUpdate({ target: restaurants.googlePlaceId, set: values })
    .returning();
  return row!;
}

/** Who was tagged on each visit. */
export async function companionsFor(db: Db, visitIds: string[]): Promise<Map<string, PublicUser[]>> {
  const result = new Map<string, PublicUser[]>(visitIds.map((id) => [id, []]));
  if (!visitIds.length) return result;
  const rows = await db
    .select({
      visitId: visitCompanions.visitId,
      user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
    })
    .from(visitCompanions)
    .innerJoin(users, eq(visitCompanions.userId, users.id))
    .where(inArray(visitCompanions.visitId, visitIds))
    .orderBy(users.displayName);
  for (const r of rows) result.get(r.visitId)!.push(toPublicUser(r.user));
  return result;
}

/** A user's visits as the viewer may see them. Callers must check friendship first. */
export async function listVisits(
  db: Db,
  storage: Storage,
  userId: string,
  viewerId: string,
  restaurantId?: string,
): Promise<Visit[]> {
  const rows = await db
    .select({ visit: visits, restaurant: restaurants, review: reviews })
    .from(visits)
    .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
    .leftJoin(reviews, eq(reviews.visitId, visits.id))
    .where(and(visitsOfFilter(userId, viewerId), restaurantId ? eq(visits.restaurantId, restaurantId) : undefined))
    .orderBy(desc(visits.visitedAt), desc(visits.createdAt))
    .limit(200);
  const reviewIds = rows.flatMap((r) => (r.review ? [r.review.id] : []));
  const [companions, dishes, photos] = await Promise.all([
    companionsFor(db, rows.map((r) => r.visit.id)),
    dishesFor(db, reviewIds),
    photosFor(db, storage, reviewIds),
  ]);
  return rows.map(({ visit, restaurant, review }) => ({
    id: visit.id,
    visitedAt: visit.visitedAt,
    audience: visit.audience,
    companions: companions.get(visit.id)!,
    restaurant: toRestaurant(restaurant),
    review: review ? toReview(review, dishes.get(review.id)!, photos.get(review.id)!) : null,
  }));
}

export function visitRoutes(app: FastifyInstance, { db, places, storage }: Deps) {
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

  app.get('/me/visits', async (req) => listVisits(db, storage, req.userId, req.userId));

  /** Your visit history at one restaurant, newest first. */
  app.get('/restaurants/:id/my-visits', async (req) => listVisits(db, storage, req.userId, req.userId, idParam(req.params)));

  /** Visits friends tagged you on that you haven't logged yourself. */
  app.get('/me/tagged', async (req): Promise<TaggedVisit[]> => {
    const rows = await db
      .select({
        visit: visits,
        restaurant: restaurants,
        by: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
      })
      .from(visitCompanions)
      .innerJoin(visits, eq(visitCompanions.visitId, visits.id))
      .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
      .innerJoin(users, eq(visits.userId, users.id))
      .where(and(eq(visitCompanions.userId, req.userId), isNull(visitCompanions.linkedVisitId), audienceAdmits(req.userId)))
      .orderBy(desc(visits.visitedAt));
    return rows.map((r) => ({
      visitId: r.visit.id,
      visitedAt: r.visit.visitedAt,
      restaurant: toRestaurant(r.restaurant),
      by: toPublicUser(r.by),
    }));
  });

  /** Remove yourself from a visit someone tagged you on. */
  app.delete('/visits/:id/companions/me', async (req, reply) => {
    await db
      .delete(visitCompanions)
      .where(and(eq(visitCompanions.visitId, idParam(req.params)), eq(visitCompanions.userId, req.userId)));
    return reply.status(204).send();
  });

  app.post('/visits', async (req, reply): Promise<Visit> => {
    const input = parse(createVisitInput, req.body);
    const companionIds = [...new Set(input.companionIds)].filter((id) => id !== req.userId);

    // Logging your side of a visit you were tagged on: it must be yours to link.
    let source: { id: string; authorId: string } | undefined;
    if (input.fromVisitId) {
      const [row] = await db
        .select({ id: visits.id, authorId: visits.userId })
        .from(visitCompanions)
        .innerJoin(visits, eq(visitCompanions.visitId, visits.id))
        .where(and(eq(visitCompanions.visitId, input.fromVisitId), eq(visitCompanions.userId, req.userId)));
      if (!row) throw notFound('Tagged visit not found');
      source = row;
    }

    const [me] = await db.select({ defaultAudience: users.defaultAudience }).from(users).where(eq(users.id, req.userId));
    const audience = input.audience ?? me!.defaultAudience;
    // "Only me" means only me: a private visit can't tag anyone.
    if (audience === 'private' && companionIds.length) {
      throw badRequest('Remove tagged friends to keep this visit to yourself');
    }
    // Logging your side of a tagged visit tags its author back, unless yours is private.
    if (source && audience !== 'private' && !companionIds.includes(source.authorId)) companionIds.push(source.authorId);
    if (companionIds.length) {
      const rels = await relationshipsWith(db, req.userId, companionIds);
      if (companionIds.some((id) => rels.get(id)?.status !== 'friends')) throw badRequest('You can only tag friends');
    }

    const restaurant = await ensureRestaurant(db, places, input.googlePlaceId);
    const afterMayorship = await watchMayorship(db, req.userId, restaurant.id);
    const result = await db.transaction(async (tx) => {
      const [visit] = await tx
        .insert(visits)
        .values({ userId: req.userId, restaurantId: restaurant.id, visitedAt: input.visitedAt, audience })
        .returning();
      // Remember the choice so the next visit starts with it.
      if (audience !== me!.defaultAudience) {
        await tx.update(users).set({ defaultAudience: audience }).where(eq(users.id, req.userId));
      }
      const [review] = input.review
        ? await tx
            .insert(reviews)
            .values({ visitId: visit!.id, rating: input.review.rating, body: input.review.body, recommends: input.review.recommends })
            .returning()
        : [];
      if (review && input.review) {
        await setDishes(tx, review.id, input.review.dishes);
        await setReviewPhotos(tx, req.userId, review.id, input.review.photoIds);
      }
      if (review) await notifySaversOfReview(tx, visit!.id, review.id);
      if (companionIds.length) {
        await tx.insert(visitCompanions).values(companionIds.map((userId) => ({ visitId: visit!.id, userId })));
        // The author of the source visit already knows; everyone else hears they were tagged.
        await notify(
          tx,
          companionIds
            .filter((id) => id !== source?.authorId)
            .map((userId) => ({
              userId,
              type: 'tagged' as const,
              actorId: req.userId,
              visitId: visit!.id,
              restaurantId: restaurant.id,
            })),
        );
      }
      if (source) {
        await tx
          .update(visitCompanions)
          .set({ linkedVisitId: visit!.id })
          .where(and(eq(visitCompanions.visitId, source.id), eq(visitCompanions.userId, req.userId)));
      }
      return { visit: visit!, review };
    });
    await evaluateBadges(db, [req.userId]);
    await checkGoalReached(db, req.userId, result.visit.visitedAt);
    await afterMayorship();
    reply.status(201);
    return {
      id: result.visit.id,
      visitedAt: result.visit.visitedAt,
      audience: result.visit.audience,
      companions: (await companionsFor(db, [result.visit.id])).get(result.visit.id)!,
      restaurant: toRestaurant(restaurant),
      review: result.review
        ? toReview(result.review, input.review?.dishes ?? [], (await photosFor(db, storage, [result.review.id])).get(result.review.id)!)
        : null,
    };
  });

  /** Changes who can see a visit you logged. */
  app.patch('/visits/:id', async (req) => {
    const { audience, removeCompanions } = parse(updateVisitInput, req.body);
    const visitId = idParam(req.params);
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(visits)
        .set({ audience })
        .where(and(eq(visits.id, visitId), eq(visits.userId, req.userId)))
        .returning({ id: visits.id, audience: visits.audience });
      if (!row) throw notFound('Visit not found');
      if (audience === 'private') {
        const tagged = await tx.select({ id: visitCompanions.userId }).from(visitCompanions).where(eq(visitCompanions.visitId, visitId));
        // Never drop tagged friends silently: the caller must confirm it.
        if (tagged.length && !removeCompanions) {
          throw badRequest('This visit has tagged friends. Confirm removing them to make it Only me');
        }
        if (tagged.length) {
          await tx.delete(visitCompanions).where(eq(visitCompanions.visitId, visitId));
          await tx.delete(notifications).where(and(eq(notifications.visitId, visitId), eq(notifications.type, 'tagged')));
        }
      }
      return row;
    });
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
      const review = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(reviews)
          .values({ visitId, rating: input.rating, body: input.body, recommends: input.recommends })
          .returning();
        await setDishes(tx, created!.id, input.dishes);
        await setReviewPhotos(tx, req.userId, created!.id, input.photoIds);
        await notifySaversOfReview(tx, visitId, created!.id);
        return created;
      });
      await evaluateBadges(db, [req.userId]);
      reply.status(201);
      return toReview(review!, input.dishes, (await photosFor(db, storage, [review!.id])).get(review!.id)!);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('This visit already has a review');
      throw err;
    }
  });

  app.patch('/reviews/:id', async (req) => {
    const review = await ownReview(idParam(req.params), req.userId);
    const input = parse(updateReviewInput, req.body);
    const { dishes, photoIds, ...fields } = input;
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(reviews)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(reviews.id, review.id))
        .returning();
      if (dishes) await setDishes(tx, review.id, dishes);
      if (photoIds) await setReviewPhotos(tx, req.userId, review.id, photoIds);
      return row!;
    });
    const [d, ph] = await Promise.all([dishesFor(db, [review.id]), photosFor(db, storage, [review.id])]);
    return toReview(updated, d.get(review.id)!, ph.get(review.id)!);
  });

  app.delete('/reviews/:id', async (req, reply) => {
    const review = await ownReview(idParam(req.params), req.userId);
    await db.delete(reviews).where(eq(reviews.id, review.id));
    return reply.status(204).send();
  });
}
