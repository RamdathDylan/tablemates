/** Shareable restaurant lists. Friends see "friends" lists; private lists are the owner's alone. */
import { listInput, listItemInput, updateListInput, type ListSummary, type RestaurantList } from '@tablemates/shared';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { listFollows, listItems, lists, restaurants, savedPlaces, users } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant } from '../lib/serialize';
import { canSeeActivityOf, relationshipWith } from '../lib/visibility';

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };
type ListRow = typeof lists.$inferSelect;

/** Owner always; friends only for "friends" lists. */
export async function canSeeList(db: Db, viewerId: string, list: ListRow) {
  if (list.ownerId === viewerId) return true;
  return list.audience === 'friends' && (await canSeeActivityOf(db, viewerId, list.ownerId));
}

async function visibleList(db: Db, viewerId: string, listId: string) {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  if (!list || !(await canSeeList(db, viewerId, list))) throw notFound('List not found');
  return list;
}

async function ownList(db: Db, viewerId: string, listId: string) {
  const list = await visibleList(db, viewerId, listId);
  if (list.ownerId !== viewerId) throw forbidden('Only the owner can change this list');
  return list;
}

async function summaries(db: Db, viewerId: string, rows: ListRow[]): Promise<ListSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((l) => l.id);
  const [owners, counts, previews, follows] = await Promise.all([
    db.select(userColumns).from(users).where(inArray(users.id, [...new Set(rows.map((l) => l.ownerId))])),
    db.select({ listId: listItems.listId, n: count() }).from(listItems).where(inArray(listItems.listId, ids)).groupBy(listItems.listId),
    db
      .select({ listId: listItems.listId, name: restaurants.name })
      .from(listItems)
      .innerJoin(restaurants, eq(listItems.restaurantId, restaurants.id))
      .where(inArray(listItems.listId, ids))
      .orderBy(desc(listItems.addedAt)),
    db.select({ listId: listFollows.listId }).from(listFollows).where(and(eq(listFollows.userId, viewerId), inArray(listFollows.listId, ids))),
  ]);
  const followed = new Set(follows.map((f) => f.listId));
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    audience: l.audience,
    owner: toPublicUser(owners.find((o) => o.id === l.ownerId)!),
    itemCount: counts.find((c) => c.listId === l.id)?.n ?? 0,
    preview: previews.filter((p) => p.listId === l.id).slice(0, 3).map((p) => p.name),
    isOwner: l.ownerId === viewerId,
    following: followed.has(l.id),
  }));
}

export function listRoutes(app: FastifyInstance, { db }: Deps) {
  /** Your lists, then lists you follow that you can still see. */
  app.get('/me/lists', async (req): Promise<{ mine: ListSummary[]; following: ListSummary[] }> => {
    const [mine, followedRows] = await Promise.all([
      db.select().from(lists).where(eq(lists.ownerId, req.userId)).orderBy(desc(lists.updatedAt)),
      db
        .select({ list: lists })
        .from(listFollows)
        .innerJoin(lists, eq(listFollows.listId, lists.id))
        .where(eq(listFollows.userId, req.userId))
        .orderBy(desc(listFollows.createdAt)),
    ]);
    const visibleFollowed = [];
    for (const { list } of followedRows) if (await canSeeList(db, req.userId, list)) visibleFollowed.push(list);
    return { mine: await summaries(db, req.userId, mine), following: await summaries(db, req.userId, visibleFollowed) };
  });

  /** A friend's shared lists (all of yours when it's you). */
  app.get('/users/:username/lists', async (req): Promise<ListSummary[]> => {
    const { username } = req.params as { username: string };
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.username, username.toLowerCase()));
    if (!owner) throw notFound('User not found');
    const rel = await relationshipWith(db, req.userId, owner.id);
    if (rel.status !== 'self' && rel.status !== 'friends') throw forbidden('Add this person as a friend to see their lists');
    const rows = await db
      .select()
      .from(lists)
      .where(rel.status === 'self' ? eq(lists.ownerId, owner.id) : and(eq(lists.ownerId, owner.id), eq(lists.audience, 'friends')))
      .orderBy(desc(lists.updatedAt));
    return summaries(db, req.userId, rows);
  });

  app.post('/lists', async (req, reply) => {
    const input = parse(listInput, req.body);
    const [list] = await db.insert(lists).values({ ownerId: req.userId, ...input }).returning({ id: lists.id });
    reply.status(201);
    return list;
  });

  app.get('/lists/:id', async (req): Promise<RestaurantList> => {
    const list = await visibleList(db, req.userId, idParam(req.params));
    const [[summary], items] = await Promise.all([
      summaries(db, req.userId, [list]),
      db
        .select({ item: listItems, restaurant: restaurants, saved: savedPlaces.userId })
        .from(listItems)
        .innerJoin(restaurants, eq(listItems.restaurantId, restaurants.id))
        .leftJoin(savedPlaces, and(eq(savedPlaces.restaurantId, restaurants.id), eq(savedPlaces.userId, req.userId)))
        .where(eq(listItems.listId, list.id))
        .orderBy(asc(listItems.addedAt)),
    ]);
    return {
      ...summary!,
      items: items.map(({ item, restaurant, saved }) => ({
        restaurant: toRestaurant(restaurant),
        note: item.note,
        addedAt: item.addedAt.toISOString(),
        saved: saved !== null,
      })),
    };
  });

  app.patch('/lists/:id', async (req) => {
    const list = await ownList(db, req.userId, idParam(req.params));
    const input = parse(updateListInput, req.body);
    await db.update(lists).set({ ...input, updatedAt: new Date() }).where(eq(lists.id, list.id));
    return { id: list.id };
  });

  app.delete('/lists/:id', async (req, reply) => {
    const list = await ownList(db, req.userId, idParam(req.params));
    await db.delete(lists).where(eq(lists.id, list.id));
    return reply.status(204).send();
  });

  /** Adds a restaurant (or updates its note). Repeating it is harmless. */
  app.put('/lists/:id/items/:restaurantId', async (req, reply) => {
    const list = await ownList(db, req.userId, idParam(req.params));
    const restaurantId = idParam(req.params, 'restaurantId');
    const { note } = parse(listItemInput, req.body ?? {});
    const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
    if (!exists) throw notFound('Restaurant not found');
    await db.transaction(async (tx) => {
      await tx
        .insert(listItems)
        .values({ listId: list.id, restaurantId, note })
        .onConflictDoUpdate({ target: [listItems.listId, listItems.restaurantId], set: { note } });
      await tx.update(lists).set({ updatedAt: new Date() }).where(eq(lists.id, list.id));
    });
    return reply.status(204).send();
  });

  app.delete('/lists/:id/items/:restaurantId', async (req, reply) => {
    const list = await ownList(db, req.userId, idParam(req.params));
    await db
      .delete(listItems)
      .where(and(eq(listItems.listId, list.id), eq(listItems.restaurantId, idParam(req.params, 'restaurantId'))));
    return reply.status(204).send();
  });

  app.put('/lists/:id/follow', async (req, reply) => {
    const list = await visibleList(db, req.userId, idParam(req.params));
    if (list.ownerId === req.userId) throw forbidden("You can't follow your own list");
    await db.insert(listFollows).values({ userId: req.userId, listId: list.id }).onConflictDoNothing();
    return reply.status(204).send();
  });

  app.delete('/lists/:id/follow', async (req, reply) => {
    await db.delete(listFollows).where(and(eq(listFollows.userId, req.userId), eq(listFollows.listId, idParam(req.params))));
    return reply.status(204).send();
  });

  /** Copies every place on a list into the viewer's want-to-try list. */
  app.post('/lists/:id/save-all', async (req) => {
    const list = await visibleList(db, req.userId, idParam(req.params));
    const items = await db.select({ restaurantId: listItems.restaurantId }).from(listItems).where(eq(listItems.listId, list.id));
    if (!items.length) return { added: 0 };
    const added = await db
      .insert(savedPlaces)
      .values(items.map((i) => ({ userId: req.userId, restaurantId: i.restaurantId })))
      .onConflictDoNothing()
      .returning({ id: savedPlaces.restaurantId });
    return { added: added.length };
  });
}
