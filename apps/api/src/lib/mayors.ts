/**
 * Mayors, Foursquare-style, but relative to the viewer's circle (you and your
 * friends): whoever has the most visits to a place in the last 60 days, among
 * the visits the viewer can see. At least 2 visits; ties go to whoever got
 * there first. Strangers' visits never count, so nothing leaks.
 */
import type { PublicUser } from '@tablemates/shared';
import { and, eq, gte } from 'drizzle-orm';

import type { Db } from '../db/client';
import { users, visits } from '../db/schema';
import { notify } from './notify';
import { toPublicUser } from './serialize';
import { visibleVisitFilter } from './visibility';

export const MAYOR_WINDOW_DAYS = 60;
const MIN_VISITS = 2;

export interface Mayor {
  user: PublicUser;
  visits: number;
}

const cutoff = (now: Date) => new Date(now.getTime() - MAYOR_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

type Row = { restaurantId: string; visitedAt: string; createdAt: Date; user: Parameters<typeof toPublicUser>[0] };

/** Picks the mayor from one restaurant's visits. */
function pick(rows: Row[]): Mayor | null {
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.user.id, [...(byUser.get(r.user.id) ?? []), r]);
  let best: { rows: Row[]; reached: string } | null = null;
  for (const mine of byUser.values()) {
    if (mine.length < MIN_VISITS) continue;
    // When they reached their count: their latest visit.
    const reached = mine.map((r) => `${r.visitedAt}|${r.createdAt.toISOString()}`).sort().at(-1)!;
    if (!best || mine.length > best.rows.length || (mine.length === best.rows.length && reached < best.reached)) {
      best = { rows: mine, reached };
    }
  }
  return best ? { user: toPublicUser(best.rows[0]!.user), visits: best.rows.length } : null;
}

async function circleVisits(db: Pick<Db, 'select'>, viewerId: string, now: Date, restaurantId?: string): Promise<Row[]> {
  return db
    .select({
      restaurantId: visits.restaurantId,
      visitedAt: visits.visitedAt,
      createdAt: visits.createdAt,
      user: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
    })
    .from(visits)
    .innerJoin(users, eq(visits.userId, users.id))
    .where(
      and(
        visibleVisitFilter(viewerId),
        gte(visits.visitedAt, cutoff(now)),
        restaurantId ? eq(visits.restaurantId, restaurantId) : undefined,
      ),
    );
}

/** The mayor of one place, in the viewer's circle. */
export async function mayorAt(db: Pick<Db, 'select'>, restaurantId: string, viewerId: string, now = new Date()) {
  return pick(await circleVisits(db, viewerId, now, restaurantId));
}

/** Every place with a mayor in the viewer's circle. */
export async function mayorships(db: Pick<Db, 'select'>, viewerId: string, now = new Date()): Promise<Map<string, Mayor>> {
  const byPlace = new Map<string, Row[]>();
  for (const r of await circleVisits(db, viewerId, now)) byPlace.set(r.restaurantId, [...(byPlace.get(r.restaurantId) ?? []), r]);
  const out = new Map<string, Mayor>();
  for (const [id, rows] of byPlace) {
    const m = pick(rows);
    if (m) out.set(id, m);
  }
  return out;
}

/**
 * Call before logging a visit; run the returned check after. If the visit takes
 * the crown from a friend, that friend hears about it. Both "before" and
 * "after" are judged from the friend's own view, so a visit they can't see
 * (private, or close friends only) can never dethrone them.
 */
export async function watchMayorship(db: Db, visitorId: string, restaurantId: string) {
  // The likeliest crown to take: the top friend here, ignoring the visitor (whose own
  // private visits might already make them mayor in their own view).
  const others = (await circleVisits(db, visitorId, new Date(), restaurantId)).filter((r) => r.user.id !== visitorId);
  const rival = pick(others)?.user.id;
  if (!rival || (await mayorAt(db, restaurantId, rival))?.user.id !== rival) return async () => {};
  return async () => {
    if ((await mayorAt(db, restaurantId, rival))?.user.id === visitorId) {
      await notify(db, { userId: rival, type: 'mayor_lost', actorId: visitorId, restaurantId });
    }
  };
}
