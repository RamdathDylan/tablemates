/** "On this day": your own past visits on today's date. Only ever your own, and never pushed. */
import { memoriesQuery, type Memory } from '@tablemates/shared';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { restaurants, reviews, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { parse } from '../lib/errors';
import { photosFor } from '../lib/photos';
import { toRestaurant } from '../lib/serialize';
import { localDate } from '../lib/zoned';
import { companionsFor } from './visits';

/** The same day of the month, `months` back; clamped (Mar 31 → Feb 28). */
export function monthsBefore(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function memoryRoutes(app: FastifyInstance, { db, storage }: Deps) {
  /**
   * Visits on this month and day in earlier years. When there are none, a visit
   * from exactly a month or six months ago stands in.
   */
  app.get('/memories', async (req): Promise<Memory[]> => {
    const [me] = await db.select({ timezone: users.timezone }).from(users).where(eq(users.id, req.userId));
    const today = parse(memoriesQuery, req.query).date ?? localDate(me?.timezone ?? 'UTC', new Date());
    const mine = eq(visits.userId, req.userId);
    const select = () =>
      db
        .select({ visit: visits, restaurant: restaurants, review: reviews })
        .from(visits)
        .innerJoin(restaurants, eq(visits.restaurantId, restaurants.id))
        .leftJoin(reviews, eq(reviews.visitId, visits.id));

    let rows = await select()
      .where(and(mine, lt(visits.visitedAt, today), sql`to_char(${visits.visitedAt}, 'MM-DD') = ${today.slice(5)}`))
      .orderBy(desc(visits.visitedAt))
      .limit(5);
    let label = (visitedAt: string) => {
      const years = Number(today.slice(0, 4)) - Number(visitedAt.slice(0, 4));
      return `${years} year${years === 1 ? '' : 's'} ago`;
    };
    if (!rows.length) {
      for (const [months, text] of [
        [1, '1 month ago'],
        [6, '6 months ago'],
      ] as const) {
        rows = await select().where(and(mine, eq(visits.visitedAt, monthsBefore(today, months)))).orderBy(desc(visits.createdAt)).limit(1);
        if (rows.length) {
          label = () => text;
          break;
        }
      }
    }
    if (!rows.length) return [];

    const reviewIds = rows.flatMap((r) => (r.review ? [r.review.id] : []));
    const [companions, photos] = await Promise.all([companionsFor(db, rows.map((r) => r.visit.id)), photosFor(db, storage, reviewIds)]);
    return rows.map((r) => ({
      label: label(r.visit.visitedAt),
      visitedAt: r.visit.visitedAt,
      restaurant: toRestaurant(r.restaurant),
      rating: r.review?.rating ?? null,
      recommends: r.review?.recommends ?? null,
      photos: r.review ? (photos.get(r.review.id) ?? []) : [],
      companions: companions.get(r.visit.id) ?? [],
    }));
  });
}
