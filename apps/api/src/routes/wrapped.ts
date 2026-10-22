/** "Your year in food": a recap built only from the viewer's own visits. */
import { wrappedQuery, type PublicUser, type Wrapped } from '@tablemates/shared';
import { and, eq, gte, inArray, lt, min, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { restaurants, reviews, users, visitCompanions, visits } from '../db/schema';
import type { Deps } from '../deps';
import { parse } from '../lib/errors';
import { goalFor } from '../lib/goals';
import { toPublicUser, toRestaurant } from '../lib/serialize';

const top = <T>(counts: Map<string, number>, n: number, make: (key: string, count: number) => T) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => make(k, c));

export function wrappedRoutes(app: FastifyInstance, { db }: Deps) {
  app.get('/me/wrapped', async (req): Promise<Wrapped> => {
    const year = parse(wrappedQuery, req.query).year ?? new Date().getFullYear();
    const from = `${year}-01-01`;
    const to = `${year + 1}-01-01`;
    const me = req.userId;

    const rows = await db
      .select({ visit: visits, restaurant: restaurants, rating: reviews.rating, recommends: reviews.recommends })
      .from(visits)
      .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
      .leftJoin(reviews, eq(reviews.visitId, visits.id))
      .where(and(eq(visits.userId, me), gte(visits.visitedAt, from), lt(visits.visitedAt, to)));

    const restaurantIds = [...new Set(rows.map((r) => r.restaurant.id))];
    const [firstVisits, companionRows] = await Promise.all([
      restaurantIds.length
        ? db
            .select({ restaurantId: visits.restaurantId, first: min(visits.visitedAt) })
            .from(visits)
            .where(and(eq(visits.userId, me), inArray(visits.restaurantId, restaurantIds)))
            .groupBy(visits.restaurantId)
        : Promise.resolve([]),
      // People you ate with this year: friends you tagged, and friends who tagged you.
      db
        .select({
          visitId: visits.id,
          user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
        })
        .from(visitCompanions)
        .innerJoin(visits, eq(visitCompanions.visitId, visits.id))
        .innerJoin(
          users,
          sql`${users.id} = case when ${visits.userId} = ${me} then ${visitCompanions.userId} else ${visits.userId} end`,
        )
        .where(
          and(
            or(eq(visits.userId, me), eq(visitCompanions.userId, me)),
            gte(visits.visitedAt, from),
            lt(visits.visitedAt, to),
          ),
        ),
    ]);
    const firstSeen = new Map(firstVisits.map((f) => [f.restaurantId, f.first]));
    const isNew = (id: string) => (firstSeen.get(id) ?? '') >= from;

    const byMonth = Array<number>(12).fill(0);
    const byWeekday = Array<number>(7).fill(0);
    const perRestaurant = new Map<string, number>();
    const perCuisine = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(`${r.visit.visitedAt}T12:00:00Z`);
      byMonth[d.getUTCMonth()]!++;
      byWeekday[d.getUTCDay()]!++;
      perRestaurant.set(r.restaurant.id, (perRestaurant.get(r.restaurant.id) ?? 0) + 1);
      for (const c of r.restaurant.cuisine) perCuisine.set(c, (perCuisine.get(c) ?? 0) + 1);
    }

    const restaurantById = new Map(rows.map((r) => [r.restaurant.id, r.restaurant]));
    const companionCounts = new Map<string, number>();
    const companionUsers = new Map<string, PublicUser>();
    const seenPairs = new Set<string>();
    for (const c of companionRows) {
      if (c.user.id === me || seenPairs.has(`${c.visitId}:${c.user.id}`)) continue;
      seenPairs.add(`${c.visitId}:${c.user.id}`);
      companionUsers.set(c.user.id, toPublicUser(c.user));
      companionCounts.set(c.user.id, (companionCounts.get(c.user.id) ?? 0) + 1);
    }

    const best = rows
      .filter((r) => r.rating !== null && isNew(r.restaurant.id))
      .sort((a, b) => b.rating! - a.rating! || a.visit.visitedAt.localeCompare(b.visit.visitedAt))[0];

    return {
      year,
      totals: {
        visits: rows.length,
        places: restaurantIds.length,
        newPlaces: restaurantIds.filter(isNew).length,
        reviews: rows.filter((r) => r.rating !== null).length,
        recommendations: rows.filter((r) => r.recommends).length,
      },
      topCuisines: top(perCuisine, 5, (name, visits) => ({ name, visits })),
      topRestaurants: top(perRestaurant, 3, (id, visits) => ({ restaurant: toRestaurant(restaurantById.get(id)!), visits })),
      byMonth,
      byWeekday,
      companions: top(companionCounts, 3, (id, visits) => ({ user: companionUsers.get(id)!, visits })),
      bestNewFind: best ? { restaurant: toRestaurant(best.restaurant), rating: best.rating! } : null,
      goal: await goalFor(db, me, me, year),
    };
  });
}
