/** Tables: small friend groups with their own feed, shared lists, and plans. */
import { feedQuery, tableInput, tableMembersInput, type FeedItem, type Page, type TableDetail, type TableSummary } from '@tablemates/shared';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { lists, planMembers, plans, reviews, tableMembers, tables, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { decodeCursor, encodeCursor } from '../lib/cursor';
import { badRequest, forbidden, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { toPublicUser } from '../lib/serialize';
import { memberTable, tableMemberIds } from '../lib/tables';
import { relationshipsWith, visibleVisitFilter } from '../lib/visibility';
import { selectFeedItems, toFeedItems } from './feed';
import { listSummaries } from './lists';
import { planSummaries } from './plans';

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };
type TableRow = typeof tables.$inferSelect;

async function tableSummaries(db: Db, viewerId: string, rows: TableRow[]): Promise<TableSummary[]> {
  if (!rows.length) return [];
  const members = await db
    .select({ tableId: tableMembers.tableId, user: userColumns })
    .from(tableMembers)
    .innerJoin(users, eq(tableMembers.userId, users.id))
    .where(inArray(tableMembers.tableId, rows.map((t) => t.id)))
    // Owner first, then by name: members seated together share a join time.
    .orderBy(desc(sql`${tableMembers.role} = 'owner'`), asc(users.displayName));
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    members: members.filter((m) => m.tableId === t.id).map((m) => toPublicUser(m.user)),
    isOwner: t.ownerId === viewerId,
  }));
}

/** Only the owner's friends can be seated, so a table never introduces strangers. */
async function requireFriends(db: Db, ownerId: string, ids: string[]) {
  const rels = await relationshipsWith(db, ownerId, ids);
  if (ids.some((id) => rels.get(id)?.status !== 'friends')) throw badRequest('You can only invite friends');
}

export function tableRoutes(app: FastifyInstance, { db, storage }: Deps) {
  app.get('/tables', async (req): Promise<TableSummary[]> => {
    const rows = await db
      .select({ table: tables })
      .from(tables)
      .innerJoin(tableMembers, and(eq(tableMembers.tableId, tables.id), eq(tableMembers.userId, req.userId)))
      .orderBy(desc(tables.createdAt));
    return tableSummaries(db, req.userId, rows.map((r) => r.table));
  });

  app.post('/tables', async (req, reply) => {
    const input = parse(tableInput, req.body);
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== req.userId);
    if (!memberIds.length) throw badRequest('Invite at least one friend');
    await requireFriends(db, req.userId, memberIds);
    const table = await db.transaction(async (tx) => {
      const [created] = await tx.insert(tables).values({ name: input.name, emoji: input.emoji, ownerId: req.userId }).returning();
      await tx.insert(tableMembers).values([
        { tableId: created!.id, userId: req.userId, role: 'owner' as const },
        ...memberIds.map((userId) => ({ tableId: created!.id, userId })),
      ]);
      await notify(tx, memberIds.map((userId) => ({ userId, type: 'table_invite' as const, actorId: req.userId, tableId: created!.id })));
      return created!;
    });
    reply.status(201);
    return { id: table.id };
  });

  app.get('/tables/:id', async (req): Promise<TableDetail> => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    const [[summary], [owner], listRows, planRows] = await Promise.all([
      tableSummaries(db, req.userId, [table]),
      db.select(userColumns).from(users).where(eq(users.id, table.ownerId)),
      db.select().from(lists).where(eq(lists.tableId, table.id)).orderBy(desc(lists.updatedAt)),
      // Plans are seated when they're made, so show the ones the viewer is in.
      db
        .select({ plan: plans })
        .from(plans)
        .innerJoin(planMembers, and(eq(planMembers.planId, plans.id), eq(planMembers.userId, req.userId)))
        .where(eq(plans.tableId, table.id))
        .orderBy(desc(plans.createdAt))
        .limit(20),
    ]);
    return {
      ...summary!,
      owner: toPublicUser(owner!),
      lists: await listSummaries(db, req.userId, listRows),
      plans: await planSummaries(db, planRows.map((r) => r.plan)),
    };
  });

  app.patch('/tables/:id', async (req) => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    if (table.ownerId !== req.userId) throw forbidden('Only the owner can rename this table');
    const input = parse(tableInput.pick({ name: true, emoji: true }).partial(), req.body);
    await db.update(tables).set(input).where(eq(tables.id, table.id));
    return { id: table.id };
  });

  app.delete('/tables/:id', async (req, reply) => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    if (table.ownerId !== req.userId) throw forbidden('Only the owner can delete this table');
    await db.delete(tables).where(eq(tables.id, table.id));
    return reply.status(204).send();
  });

  app.post('/tables/:id/members', async (req) => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    if (table.ownerId !== req.userId) throw forbidden('Only the owner can invite people');
    const { userIds } = parse(tableMembersInput, req.body);
    const seated = await tableMemberIds(db, table.id);
    const added = [...new Set(userIds)].filter((id) => !seated.includes(id));
    await requireFriends(db, req.userId, added);
    if (added.length) {
      await db.transaction(async (tx) => {
        await tx.insert(tableMembers).values(added.map((userId) => ({ tableId: table.id, userId }))).onConflictDoNothing();
        await notify(tx, added.map((userId) => ({ userId, type: 'table_invite' as const, actorId: req.userId, tableId: table.id })));
      });
    }
    return { added: added.length };
  });

  /** The owner removes someone, or a member leaves. The owner deletes the table instead of leaving. */
  app.delete('/tables/:id/members/:userId', async (req, reply) => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    const userId = idParam(req.params, 'userId');
    if (userId !== req.userId && table.ownerId !== req.userId) throw forbidden('Only the owner can remove people');
    if (userId === table.ownerId) throw badRequest('The owner can delete the table instead of leaving');
    await db.delete(tableMembers).where(and(eq(tableMembers.tableId, table.id), eq(tableMembers.userId, userId)));
    return reply.status(204).send();
  });

  /** Members' reviews, newest first, still limited to the reviews the viewer may see. */
  app.get('/tables/:id/feed', async (req): Promise<Page<FeedItem>> => {
    const table = await memberTable(db, req.userId, idParam(req.params));
    const { cursor, limit } = parse(feedQuery, req.query);
    const conditions = [
      visibleVisitFilter(req.userId),
      sql`${visits.userId} in (select ${tableMembers.userId} from ${tableMembers} where ${tableMembers.tableId} = ${table.id})`,
    ];
    if (cursor) {
      const c = decodeCursor(cursor);
      conditions.push(sql`(${reviews.createdAt}, ${reviews.id}) < (${c.createdAt.toISOString()}::timestamptz, ${c.id}::uuid)`);
    }
    const rows = await selectFeedItems(db, req.userId, and(...conditions), limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: await toFeedItems(db, storage, req.userId, page),
      nextCursor: rows.length > limit && last ? encodeCursor(last.review.createdAt, last.review.id) : null,
    };
  });
}
