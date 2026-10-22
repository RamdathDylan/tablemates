import {
  updateProfileInput,
  userSearchQuery,
  username as usernameSchema,
  type Profile,
  type UserSearchResult,
} from '@tablemates/shared';
import { and, count, eq, ilike, ne, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { friendships, reviews, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound, parse } from '../lib/errors';
import { toMe, toPublicUser } from '../lib/serialize';
import { relationshipsWith, relationshipWith, visitsOfFilter } from '../lib/visibility';
import { listVisits } from './visits';

const publicColumns = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};

export function userRoutes(app: FastifyInstance, { db }: Deps) {
  async function findByUsername(raw: unknown) {
    const parsed = usernameSchema.safeParse(raw);
    if (!parsed.success) throw notFound('User not found');
    const [user] = await db.select().from(users).where(eq(users.username, parsed.data));
    if (!user) throw notFound('User not found');
    return user;
  }

  app.get('/me', async (req) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId));
    if (!user) throw notFound('User not found');
    return toMe(user);
  });

  app.patch('/me', async (req) => {
    const input = parse(updateProfileInput, req.body);
    const [user] = await db.update(users).set(input).where(eq(users.id, req.userId)).returning();
    if (!user) throw notFound('User not found');
    return toMe(user);
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
    }
    return profile;
  });

  app.get('/users/:username/visits', async (req) => {
    const user = await findByUsername((req.params as { username: string }).username);
    const rel = await relationshipWith(db, req.userId, user.id);
    if (rel.status !== 'self' && rel.status !== 'friends') {
      throw forbidden('Add this person as a friend to see their visits');
    }
    return listVisits(db, user.id, req.userId);
  });
}
