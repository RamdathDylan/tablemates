/**
 * Taste match and For You. Everything here reads reviews through the same
 * visibility rules as the feed, so a private review never shapes a score.
 */
import type { ForYouItem, PublicUser, TasteMatch } from '@tablemates/shared';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from '../db/client';
import { restaurants, reviews, savedPlaces, users, visits } from '../db/schema';
import { toPublicUser, toRestaurant } from './serialize';
import { friendIdsOf, friendVisitFilter } from './visibility';

/** Shared ratings needed before a match percentage means anything. */
export const MIN_OVERLAP = 3;
/** Weight for friends without enough overlap yet (as if they were a 60% match). */
const DEFAULT_MATCH = 60;

/** Latest rating per (author, restaurant). Rows must be newest first. */
function latestRatings(rows: { userId: string; restaurantId: string; rating: number }[]) {
  const byUser = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const m = byUser.get(r.userId) ?? byUser.set(r.userId, new Map()).get(r.userId)!;
    if (!m.has(r.restaurantId)) m.set(r.restaurantId, r.rating);
  }
  return byUser;
}

/** The viewer's ratings plus friends' ratings the viewer may see. */
async function ratings(db: Db, viewerId: string) {
  const [mine, theirs] = await Promise.all([
    db
      .select({ userId: visits.userId, restaurantId: visits.restaurantId, rating: reviews.rating })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(eq(visits.userId, viewerId))
      .orderBy(desc(visits.visitedAt), desc(visits.createdAt)),
    db
      .select({ userId: visits.userId, restaurantId: visits.restaurantId, rating: reviews.rating, recommends: reviews.recommends })
      .from(reviews)
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(friendVisitFilter(viewerId))
      .orderBy(desc(visits.visitedAt), desc(visits.createdAt))
      .limit(5000),
  ]);
  return { mine: latestRatings(mine).get(viewerId) ?? new Map<string, number>(), theirs, friends: latestRatings(theirs) };
}

function compare(mine: Map<string, number>, theirs: Map<string, number> | undefined) {
  const shared = [...(theirs ?? new Map()).entries()].filter(([id]) => mine.has(id)).map(([id, them]) => ({ id, you: mine.get(id)!, them }));
  const match =
    shared.length >= MIN_OVERLAP
      ? Math.round(100 * (1 - shared.reduce((s, x) => s + Math.abs(x.you - x.them), 0) / shared.length / 4))
      : null;
  return { match, shared };
}

// Small per-viewer cache: scores change slowly and friend lists ask for every friend at once.
const cache = new Map<string, { at: number; value: Map<string, number | null> }>();
const CACHE_MS = 10 * 60 * 1000;

/** Match percentage for each of the viewer's friends (null when too little overlap). */
export async function matchesFor(db: Db, viewerId: string): Promise<Map<string, number | null>> {
  const hit = cache.get(viewerId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const { mine, friends } = await ratings(db, viewerId);
  const value = new Map([...friends.entries()].map(([id, r]) => [id, compare(mine, r).match]));
  cache.set(viewerId, { at: Date.now(), value });
  return value;
}

/** Clears cached matches, e.g. in tests or after bulk changes. */
export function clearTasteCache() {
  cache.clear();
}

/** Full comparison with one friend, including where you agree. */
export async function tasteWith(db: Db, viewerId: string, friendId: string): Promise<TasteMatch> {
  const { mine, friends } = await ratings(db, viewerId);
  const { match, shared } = compare(mine, friends.get(friendId));
  const closest = shared.sort((a, b) => Math.abs(a.you - a.them) - Math.abs(b.you - b.them) || b.you - a.you).slice(0, 3);
  const names = closest.length
    ? await db.select({ id: restaurants.id, name: restaurants.name }).from(restaurants).where(inArray(restaurants.id, closest.map((c) => c.id)))
    : [];
  return {
    match,
    overlap: shared.length,
    agree: closest.map((c) => ({ restaurant: names.find((n) => n.id === c.id)!, you: c.you, them: c.them })),
  };
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Places friends rated 4★+ that the viewer hasn't visited. Each friend's
 * stars count in proportion to how much your tastes match; recommendations
 * add a bonus, and nearby places get a boost when a location is given.
 */
export async function forYou(
  db: Db,
  viewerId: string,
  { lat, lng, limit }: { lat?: number; lng?: number; limit: number },
): Promise<ForYouItem[]> {
  const [{ mine, theirs, friends }, visited, saved] = await Promise.all([
    ratings(db, viewerId),
    db.selectDistinct({ id: visits.restaurantId }).from(visits).where(eq(visits.userId, viewerId)),
    db.select({ id: savedPlaces.restaurantId }).from(savedPlaces).where(eq(savedPlaces.userId, viewerId)),
  ]);
  const beenTo = new Set(visited.map((v) => v.id));
  const savedIds = new Set(saved.map((s) => s.id));
  const matchOf = new Map([...friends.entries()].map(([id, r]) => [id, compare(mine, r).match]));

  // Latest review per friend per restaurant, 4★ and up, at places you haven't been.
  const seen = new Set<string>();
  const candidates = new Map<string, { score: number; recommends: number; reasons: { userId: string; rating: number; match: number | null }[] }>();
  for (const r of theirs) {
    const key = `${r.userId}:${r.restaurantId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (r.rating < 4 || beenTo.has(r.restaurantId)) continue;
    const match = matchOf.get(r.userId) ?? null;
    const c = candidates.get(r.restaurantId) ?? { score: 0, recommends: 0, reasons: [] };
    c.score += r.rating * ((match ?? DEFAULT_MATCH) / 100) + (r.recommends ? 1 : 0);
    if (r.recommends) c.recommends++;
    c.reasons.push({ userId: r.userId, rating: r.rating, match });
    candidates.set(r.restaurantId, c);
  }
  if (!candidates.size) return [];

  const ids = [...candidates.keys()];
  const reasonUsers = [...new Set([...candidates.values()].flatMap((c) => c.reasons.map((r) => r.userId)))];
  const [rows, people] = await Promise.all([
    db.select().from(restaurants).where(inArray(restaurants.id, ids)),
    db
      .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
      .from(users)
      .where(and(inArray(users.id, reasonUsers), sql`${users.id} in (${friendIdsOf(viewerId)})`)),
  ]);
  const personById = new Map(people.map((p) => [p.id, toPublicUser(p) as PublicUser]));

  return rows
    .map((r) => {
      const c = candidates.get(r.id)!;
      const distanceKm =
        lat !== undefined && lng !== undefined && r.lat !== null && r.lng !== null
          ? Math.round(haversineKm(lat, lng, r.lat, r.lng) * 10) / 10
          : null;
      // A gentle boost: a place 5 km away counts about half as much as one next door.
      const score = distanceKm === null ? c.score : c.score / (1 + distanceKm / 5);
      return {
        restaurant: toRestaurant(r),
        score: Math.round(score * 100) / 100,
        reasons: c.reasons
          .sort((a, b) => (b.match ?? DEFAULT_MATCH) * b.rating - (a.match ?? DEFAULT_MATCH) * a.rating)
          .slice(0, 2)
          .flatMap((x) => (personById.has(x.userId) ? [{ user: personById.get(x.userId)!, rating: x.rating, match: x.match }] : [])),
        recommends: c.recommends,
        distanceKm,
        saved: savedIds.has(r.id),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
