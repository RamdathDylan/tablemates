import type { Dish } from '@tablemates/shared';
import { asc, eq, inArray } from 'drizzle-orm';

import type { Db } from '../db/client';
import { reviewDishes } from '../db/schema';

type Tx = Pick<Db, 'insert' | 'delete' | 'select'>;

/** "Cacio e Pepe!" → "cacio e pepe", so friends' spellings group together. */
export function dishKey(name: string) {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Replaces a review's dishes (dropping repeats of the same dish). */
export async function setDishes(tx: Tx, reviewId: string, dishes: Dish[]) {
  await tx.delete(reviewDishes).where(eq(reviewDishes.reviewId, reviewId));
  const seen = new Set<string>();
  const rows = dishes.flatMap((d, position) => {
    const nameKey = dishKey(d.name);
    if (!nameKey || seen.has(nameKey)) return [];
    seen.add(nameKey);
    return [{ reviewId, name: d.name, nameKey, rating: d.rating, position }];
  });
  if (rows.length) await tx.insert(reviewDishes).values(rows);
}

/** Dishes for many reviews in one query. */
export async function dishesFor(db: Pick<Db, 'select'>, reviewIds: string[]): Promise<Map<string, Dish[]>> {
  const result = new Map<string, Dish[]>(reviewIds.map((id) => [id, []]));
  if (!reviewIds.length) return result;
  const rows = await db
    .select()
    .from(reviewDishes)
    .where(inArray(reviewDishes.reviewId, reviewIds))
    .orderBy(asc(reviewDishes.position));
  for (const r of rows) result.get(r.reviewId)?.push({ name: r.name, rating: r.rating });
  return result;
}
