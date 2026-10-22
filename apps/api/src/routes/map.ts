/** The friends map: every visible visit, grouped by restaurant. */
import { mapPlacesQuery, type MapPlace, type MapVisitor } from '@tablemates/shared';
import { desc, eq, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { restaurants, reviews, savedPlaces, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, parse } from '../lib/errors';
import { toPublicUser, toRestaurant } from '../lib/serialize';
import { canSeeActivityOf, friendAuthorFilter, visibleAuthorFilter } from '../lib/visibility';

/** Upper bound on visits read per request; plenty for a friend group, and keeps the query cheap. */
const MAX_VISITS = 2000;
const MAX_VISITORS = 5;

type Row = Awaited<ReturnType<typeof selectVisits>>[number];

function selectVisits(db: Deps['db'], where: SQL | undefined) {
  return db
    .select({
      visitedAt: visits.visitedAt,
      createdAt: visits.createdAt,
      restaurant: restaurants,
      review: { rating: reviews.rating, body: reviews.body, recommends: reviews.recommends },
      author: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
    })
    .from(visits)
    .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
    .innerJoin(users, eq(visits.userId, users.id))
    .leftJoin(reviews, eq(reviews.visitId, visits.id))
    .where(where)
    .orderBy(desc(visits.visitedAt), desc(visits.createdAt))
    .limit(MAX_VISITS);
}

const average = (ratings: number[]) =>
  ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null;

/** Great-circle distance in km. */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Rows arrive newest first, so the first row seen for anything is the most recent. */
function summarize(rows: Row[], viewerId: string, origin?: { lat: number; lng: number }): MapPlace[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const list = groups.get(row.restaurant.id) ?? groups.set(row.restaurant.id, []).get(row.restaurant.id)!;
    list.push(row);
  }

  return [...groups.values()].map((group) => {
    const r = group[0]!.restaurant;
    const mine = group.filter((v) => v.author.id === viewerId);
    const theirs = group.filter((v) => v.author.id !== viewerId);
    const rated = (vs: Row[]) => vs.flatMap((v) => (v.review ? [v.review.rating] : []));
    const recommendCount = (vs: Row[]) => vs.filter((v) => v.review?.recommends).length;
    const myReview = mine.find((v) => v.review)?.review ?? null;

    const visitors: MapVisitor[] = [];
    const seen = new Set<string>();
    for (const v of theirs) {
      if (seen.has(v.author.id)) continue;
      seen.add(v.author.id);
      if (visitors.length < MAX_VISITORS) {
        visitors.push({
          user: toPublicUser(v.author),
          rating: v.review?.rating ?? null,
          recommends: v.review?.recommends ?? null,
          visitedAt: v.visitedAt,
        });
      }
    }
    const latest = group.find((v) => v.review?.body);

    return {
      restaurant: toRestaurant(r),
      summary: {
        visits: group.length,
        recommends: recommendCount(group),
        averageRating: average(rated(group)),
        lastVisitedAt: group[0]!.visitedAt,
      },
      me: mine.length
        ? {
            visits: mine.length,
            rating: myReview?.rating ?? null,
            recommends: myReview?.recommends ?? null,
            lastVisitedAt: mine[0]!.visitedAt,
          }
        : null,
      friends: {
        count: seen.size,
        visits: theirs.length,
        recommends: recommendCount(theirs),
        averageRating: average(rated(theirs)),
        visitors,
      },
      latestReview: latest?.review
        ? {
            author: toPublicUser(latest.author),
            rating: latest.review.rating,
            body: latest.review.body,
            recommends: latest.review.recommends,
            visitedAt: latest.visitedAt,
          }
        : null,
      distanceKm: distanceFrom(origin, r),
      saved: false,
    };
  });
}

function distanceFrom(origin: { lat: number; lng: number } | undefined, r: { lat: number | null; lng: number | null }) {
  return origin && r.lat !== null && r.lng !== null
    ? Math.round(haversineKm(origin.lat, origin.lng, r.lat, r.lng) * 10) / 10
    : null;
}

/** A saved restaurant nobody in scope has visited yet. */
function savedOnly(r: typeof restaurants.$inferSelect, origin?: { lat: number; lng: number }): MapPlace {
  return {
    restaurant: toRestaurant(r),
    summary: { visits: 0, recommends: 0, averageRating: null, lastVisitedAt: '' },
    me: null,
    friends: { count: 0, visits: 0, recommends: 0, averageRating: null, visitors: [] },
    latestReview: null,
    distanceKm: distanceFrom(origin, r),
    saved: true,
  };
}

const byDesc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

const sorters: Record<string, (a: MapPlace, b: MapPlace) => number> = {
  recommended: (a, b) =>
    b.summary.recommends - a.summary.recommends ||
    byDesc(a.summary.averageRating, b.summary.averageRating) ||
    b.summary.visits - a.summary.visits,
  rating: (a, b) => byDesc(a.summary.averageRating, b.summary.averageRating) || b.summary.visits - a.summary.visits,
  recent: (a, b) => b.summary.lastVisitedAt.localeCompare(a.summary.lastVisitedAt),
  distance: (a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity),
};

export function mapRoutes(app: FastifyInstance, { db }: Deps) {
  app.get('/map/places', async (req): Promise<MapPlace[]> => {
    const q = parse(mapPlacesQuery, req.query);
    const me = req.userId;

    let author: SQL;
    switch (q.scope) {
      case 'me':
        author = eq(visits.userId, me);
        break;
      case 'friends':
        author = friendAuthorFilter(visits.userId, me);
        break;
      case 'friend':
        if (!(await canSeeActivityOf(db, me, q.friendId!)) || q.friendId === me) {
          throw forbidden('You can only filter by people you are friends with');
        }
        author = eq(visits.userId, q.friendId!);
        break;
      default:
        author = visibleAuthorFilter(visits.userId, me);
    }

    const origin = q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    const [rows, saved] = await Promise.all([
      selectVisits(db, author),
      db
        .select({ restaurant: restaurants })
        .from(savedPlaces)
        .innerJoin(restaurants, eq(savedPlaces.restaurantId, restaurants.id))
        .where(eq(savedPlaces.userId, me)),
    ]);
    let places = summarize(rows, me, origin);
    const savedIds = new Set(saved.map((s) => s.restaurant.id));
    for (const p of places) p.saved = savedIds.has(p.restaurant.id);
    // Your list is yours: saved-but-unvisited places join the views that include you.
    if (q.scope === 'everyone' || q.scope === 'me' || q.saved) {
      const shown = new Set(places.map((p) => p.restaurant.id));
      for (const s of saved) if (!shown.has(s.restaurant.id)) places.push(savedOnly(s.restaurant, origin));
    }
    if (q.saved) places = places.filter((p) => p.saved);

    if (q.recommended) places = places.filter((p) => p.summary.recommends > 0);
    if (q.minRating) places = places.filter((p) => (p.summary.averageRating ?? 0) >= q.minRating!);
    if (q.cuisine) {
      const c = q.cuisine.toLowerCase();
      places = places.filter((p) => p.restaurant.cuisine.some((x) => x.toLowerCase() === c));
    }
    return places.sort(sorters[q.sort]);
  });
}
