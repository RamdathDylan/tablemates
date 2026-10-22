import { and, eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { tableMembers, tables } from '../db/schema';
import { notFound } from './errors';

export async function isTableMember(db: Pick<Db, 'select'>, userId: string, tableId: string) {
  const [row] = await db
    .select({ role: tableMembers.role })
    .from(tableMembers)
    .where(and(eq(tableMembers.tableId, tableId), eq(tableMembers.userId, userId)));
  return row?.role ?? null;
}

/** The table, if the viewer belongs to it; otherwise 404. */
export async function memberTable(db: Db, userId: string, tableId: string) {
  const [table] = await db.select().from(tables).where(eq(tables.id, tableId));
  if (!table || !(await isTableMember(db, userId, tableId))) throw notFound('Table not found');
  return table;
}

export async function tableMemberIds(db: Pick<Db, 'select'>, tableId: string) {
  const rows = await db.select({ id: tableMembers.userId }).from(tableMembers).where(eq(tableMembers.tableId, tableId));
  return rows.map((r) => r.id);
}
