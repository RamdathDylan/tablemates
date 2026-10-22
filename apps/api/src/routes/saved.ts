/** The viewer's private want-to-try list. */
import type { SavedPlace } from '@tablemates/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { restaurants, savedPlaces } from '../db/schema';
import type { Deps } from '../deps';
import { evaluateBadges, recommendersAmongFriends } from '../lib/badges';
import { notFound } from '../lib/errors';
import { idParam } from '../lib/params';
import { toRestaurant } from '../lib/serialize';

export function savedRoutes(app: FastifyInstance, { db }: Deps) {
  app.get('/me/saved', async (req): Promise<SavedPlace[]> => {
    const rows = await db
      .select({ restaurant: restaurants, savedAt: savedPlaces.createdAt })
      .from(savedPlaces)
      .innerJoin(restaurants, eq(savedPlaces.restaurantId, restaurants.id))
      .where(eq(savedPlaces.userId, req.userId))
      .orderBy(desc(savedPlaces.createdAt));
    return rows.map((r) => ({ restaurant: toRestaurant(r.restaurant), savedAt: r.savedAt.toISOString() }));
  });

  // PUT/DELETE so repeating either is harmless.
  app.put('/restaurants/:id/save', async (req, reply) => {
    const restaurantId = idParam(req.params);
    const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!exists) throw notFound('Restaurant not found');
    const [added] = await db
      .insert(savedPlaces)
      .values({ userId: req.userId, restaurantId })
      .onConflictDoNothing()
      .returning({ id: savedPlaces.restaurantId });
    // A save can push a friend who recommended this place toward Tastemaker.
    if (added) await evaluateBadges(db, await recommendersAmongFriends(db, req.userId, restaurantId));
    return reply.status(204).send();
  });

  app.delete('/restaurants/:id/save', async (req, reply) => {
    await db
      .delete(savedPlaces)
      .where(and(eq(savedPlaces.userId, req.userId), eq(savedPlaces.restaurantId, idParam(req.params))));
    return reply.status(204).send();
  });
}
