import {
  favoritesInput,
  goalInput,
  updateProfileInput,
  userSearchQuery,
  username as usernameSchema,
  type Profile,
  type Streak,
  type UserSearchResult,
} from '@tablemates/shared';
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { friendships, goals, reviews, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { toMe, toPublicUser } from '../lib/serialize';
import { passport } from '../lib/badges';
import { favoritesFor, setFavorites } from '../lib/favorites';
import { ownReadyPhotos } from '../lib/photos';
import { checkGoalReached, currentYearOf, goalFor } from '../lib/goals';
import { streakFor } from '../lib/streaks';
import { tasteWith } from '../lib/taste';
import { relationshipsWith, relationshipWith, visitsOfFilter } from '../lib/visibility';
import { listVisits } from './visits';

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

export function userRoutes(app: FastifyInstance, { db, storage, publicApiUrl }: Deps) {
  async function findByUsername(raw: unknown) {
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) throw notFound('User not found');
    const [user] = await db.select().from(users).where(eq(users.username, parsed.data));
    if (!user) throw notFound('User not found');
    return user;
  }

  app.get('/me/streak', async (req): Promise<Streak> => streakFor(db, req.userId, req.userId));

  /** Sets (or changes) a year's goal. Only this year and next. */
  app.put('/me/goals/:year', async (req) => {
    const year = Number((req.params as { year: string }).year);
    const current = await currentYearOf(db, req.userId);
    if (year !== current && year !== current + 1) throw badRequest(`Set a goal for ${current} or ${current + 1}`);
    const { target } = parse(goalInput, req.body);
    await db
      .insert(goals)
      .values({ userId: req.userId, year, targetNewPlaces: target })
      // Raising the target past what's done means it can be reached (and celebrated) again.
      .onConflictDoUpdate({ target: [goals.userId, goals.year], set: { targetNewPlaces: target, reachedAt: null } });
    await checkGoalReached(db, req.userId, `${year}-01-01`);
    return goalFor(db, req.userId, req.userId, year);
  });

  app.delete('/me/goals/:year', async (req, reply) => {
    const year = Number((req.params as { year: string }).year);
    await db.delete(goals).where(and(eq(goals.userId, req.userId), eq(goals.year, year)));
    return reply.status(204).send();
  });

  app.get('/me', async (req) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) throw notFound('User not found');
    return toMe(user);
  });

  app.patch('/me', async (req) => {
    const { avatarPhotoId, ...input } = parse(updateProfileInput, req.body);
    if (avatarPhotoId) {
      // Avatars are public profile pictures, served through a stable redirect URL.
      await ownReadyPhotos(db, req.userId, [avatarPhotoId], 'avatar');
      input.avatarUrl = `${publicApiUrl}/avatars/${avatarPhotoId}`;
    } else if (avatarPhotoId === null) {
      input.avatarUrl = null;
    }
    const [user] = await db.update(users).set(input).where(eq(users.id, req.userId)).returning();
    if (!user) throw notFound('User not found');
    return toMe(user);
  });

  app.put('/me/favorites', async (req) => {
    const { restaurantIds } = parse(favoritesInput, req.body);
    await setFavorites(db, req.userId, restaurantIds);
    return favoritesFor(db, storage, req.userId, req.userId);
  });

  app.get('/users/search', async (req): Promise<UserSearchResult[]> => {
    const { q } = parse(userSearchQuery, req.query);
    const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    const rows = await db
      .select(publicColumns)
      .from(users)
      .where(
        and(
          ne(users.id, req.userId),
          or(ilike(users.username, pattern), ilike(users.displayName, pattern)),
        ),
      )
      .orderBy(users.username)
      .limit(20);
    const rels = await relationshipsWith(
      db,
      req.userId,
      rows.map((r) => r.id),
    );
    return rows.map((r) => {
      const rel = rels.get(r.id)!;
      return { ...toPublicUser(r), friendship: rel.status, requestId: rel.requestId };
    });
  });

  app.get('/users/:username', async (req): Promise<Profile> => {
    const user = await findByUsername((req.params as { username: string }).username);
    const rel = await relationshipWith(db, req.userId, user.id);
    const profile: Profile = {
      ...toPublicUser(user),
      bio: user.bio,
      homeCity: user.homeCity,
      friendship: rel.status,
      requestId: rel.requestId,
    };
    if (rel.status === 'self' || rel.status === 'friends') {
      const [[v], [r], [f]] = await Promise.all([
        // Counts only what the viewer could actually open.
        db.select({ n: count() }).from(visits).where(visitsOfFilter(user.id, req.userId)),
        db
          .select({ n: count() })
          .from(reviews)
          .innerJoin(visits, eq(reviews.visitId, visits.id))
          .where(visitsOfFilter(user.id, req.userId)),
        db
          .select({ n: count() })
          .from(friendships)
          .where(
            and(
              eq(friendships.status, 'accepted'),
              or(eq(friendships.requesterId, user.id), eq(friendships.addresseeId, user.id)),
            ),
          ),
      ]);
      profile.stats = { visits: v!.n, reviews: r!.n, friends: f!.n };
      if (rel.status === 'friends') profile.taste = await tasteWith(db, req.userId, user.id);
      profile.favorites = await favoritesFor(db, storage, user.id, req.userId);
      profile.streak = await streakFor(db, user.id, req.userId);
      profile.goal = await goalFor(db, user.id, req.userId, await currentYearOf(db, user.id));
    }
    return profile;
  });

  /** Your passport (with progress), or a friend's earned badges. */
  app.get('/users/:username/badges', async (req) => {
    const user = await findByUsername((req.params as { username: string }).username);
    const rel = await relationshipWith(db, req.userId, user.id);
    if (rel.status !== 'self' && rel.status !== 'friends') throw forbidden('Add this person as a friend to see their badges');
    return passport(db, user.id, rel.status === 'self');
  });

  app.get('/users/:username/visits', async (req) => {
    const user = await findByUsername((req.params as { username: string }).username);
    const rel = await relationshipWith(db, req.userId, user.id);
    if (rel.status !== 'self' && rel.status !== 'friends') {
      throw forbidden('Add this person as a friend to see their visits');
    }
    return listVisits(db, storage, user.id, req.userId);
  });
}
