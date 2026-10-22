/**
 * The single place that decides who can see whose visits and reviews.
 * TableMates' core rule: you only see recommendations from accepted friends.
 * Every query that reads visits or reviews must filter through these helpers.
 */
import type { FriendshipStatus } from '@tablemates/shared';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { Db } from '../db/client';
import { friendships } from '../db/schema';

/** Subquery yielding the ids of the viewer's accepted friends. */
export function friendIdsOf(viewerId: string): SQL {
  return sql`select case when ${friendships.requesterId} = ${viewerId}
      then ${friendships.addresseeId} else ${friendships.requesterId} end
    from ${friendships}
    where ${friendships.status} = 'accepted'
      and (${friendships.requesterId} = ${viewerId} or ${friendships.addresseeId} = ${viewerId})`;
}

/** Rows authored by the viewer's friends (not the viewer). Used for the feed. */
export function friendAuthorFilter(authorColumn: PgColumn, viewerId: string): SQL {
  return sql`${authorColumn} in (${friendIdsOf(viewerId)})`;
}

/** Rows authored by the viewer or the viewer's friends. */
export function visibleAuthorFilter(authorColumn: PgColumn, viewerId: string): SQL {
  return or(eq(authorColumn, viewerId), friendAuthorFilter(authorColumn, viewerId))!;
}

export interface Relationship {
  status: FriendshipStatus;
  /** The pending request's id, so the client can accept or cancel it. */
  requestId: string | null;
}

/** The viewer's relationship to each of the given users. */
export async function relationshipsWith(
  db: Db,
  viewerId: string,
  otherIds: string[],
): Promise<Map<string, Relationship>> {
  const result = new Map<string, Relationship>();
  for (const id of otherIds) {
    result.set(id, { status: id === viewerId ? 'self' : 'none', requestId: null });
  }
  const others = otherIds.filter((id) => id !== viewerId);
  if (others.length === 0) return result;

  const rows = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.requesterId, viewerId), inArray(friendships.addresseeId, others)),
        and(eq(friendships.addresseeId, viewerId), inArray(friendships.requesterId, others)),
      ),
    );
  for (const row of rows) {
    const otherId = row.requesterId === viewerId ? row.addresseeId : row.requesterId;
    if (row.status === 'accepted') {
      result.set(otherId, { status: 'friends', requestId: null });
    } else {
      result.set(otherId, {
        status: row.requesterId === viewerId ? 'outgoing' : 'incoming',
        requestId: row.id,
      });
    }
  }
  return result;
}

export async function relationshipWith(db: Db, viewerId: string, otherId: string) {
  return (await relationshipsWith(db, viewerId, [otherId])).get(otherId)!;
}

/** True when the viewer may see the other user's visits and reviews. */
export async function canSeeActivityOf(db: Db, viewerId: string, otherId: string) {
  const { status } = await relationshipWith(db, viewerId, otherId);
  return status === 'self' || status === 'friends';
}
