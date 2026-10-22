/**
 * The single place that decides who can see whose visits and reviews.
 * TableMates' core rule: you only see recommendations from accepted friends,
 * and each visit's audience (friends, close friends, or private) narrows that.
 * Every query that reads visits or reviews must filter through these helpers.
 */
import type { FriendshipStatus } from '@tablemates/shared';
import { and, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { Db } from '../db/client';
import { closeFriends, friendships, visitCompanions, visits } from '../db/schema';

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

/**
 * Visits whose audience admits the viewer, assuming the viewer is the author's
 * friend: "friends" visits, "close_friends" visits when the author listed them,
 * and any visit the viewer was tagged on (they were there).
 * Never used alone; combine with a friendship check.
 */
export function audienceAdmits(viewerId: string): SQL {
  return sql`(${visits.audience} = 'friends'
    or (${visits.audience} = 'close_friends' and exists (
      select 1 from ${closeFriends}
      where ${closeFriends.ownerId} = ${visits.userId} and ${closeFriends.friendId} = ${viewerId}))
    or exists (
      select 1 from ${visitCompanions}
      where ${visitCompanions.visitId} = ${visits.id} and ${visitCompanions.userId} = ${viewerId}))`;
}

/** Friends' visits the viewer may see. Used for the feed and friends-only views. */
export function friendVisitFilter(viewerId: string): SQL {
  return and(friendAuthorFilter(visits.userId, viewerId), audienceAdmits(viewerId))!;
}

/** The viewer's own visits plus the friends' visits they may see. */
export function visibleVisitFilter(viewerId: string): SQL {
  return or(eq(visits.userId, viewerId), friendVisitFilter(viewerId))!;
}

/**
 * One person's visits as the viewer may see them. Callers must already have
 * checked the two are friends (or the same person) with canSeeActivityOf.
 */
export function visitsOfFilter(ownerId: string, viewerId: string): SQL {
  return ownerId === viewerId
    ? eq(visits.userId, ownerId)
    : and(eq(visits.userId, ownerId), audienceAdmits(viewerId))!;
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
