/**
 * The single place that decides who can see whose visits, reviews, stories and
 * check-ins. TableMates' core rule: you only see activity from accepted
 * friends, and each item's audience (friends, close friends, or private)
 * narrows that. Every query that reads that content filters through these
 * helpers; a test fails if audience SQL is written anywhere else.
 */
import type { FriendshipStatus } from '@tablemates/shared';
import { and, eq, inArray, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

import type { Db } from '../db/client';
import { closeFriends, friendships, visitCompanions, visits } from '../db/schema';

/**
 * Who is asking: a user id, or a column holding one (for example to find every
 * user who may see an item, as alerts do).
 */
export type Viewer = string | SQLWrapper;

/** Subquery yielding the ids of the viewer's accepted friends. */
export function friendIdsOf(viewerId: Viewer): SQL {
  return sql`select case when ${friendships.requesterId} = ${viewerId}
      then ${friendships.addresseeId} else ${friendships.requesterId} end
    from ${friendships}
    where ${friendships.status} = 'accepted'
      and (${friendships.requesterId} = ${viewerId} or ${friendships.addresseeId} = ${viewerId})`;
}

/** Rows authored by the viewer's friends (not the viewer). Used for the feed. */
export function friendAuthorFilter(authorColumn: PgColumn, viewerId: Viewer): SQL {
  return sql`${authorColumn} in (${friendIdsOf(viewerId)})`;
}

/**
 * Visits whose audience admits the viewer, assuming the viewer is the author's
 * friend: "friends" visits, "close_friends" visits when the author listed them,
 * and non-private visits the viewer was tagged on (they were there).
 * "Only me" visits admit nobody. Never used alone; combine with a friendship check.
 */
export function audienceAdmits(viewerId: Viewer): SQL {
  return sql`(${friendsOrCloseFriends(visits.audience, visits.userId, viewerId)}
    or (${visits.audience} <> 'private' and exists (
      select 1 from ${visitCompanions}
      where ${visitCompanions.visitId} = ${visits.id} and ${visitCompanions.userId} = ${viewerId})))`;
}

/**
 * The audience rule shared by every kind of content: "friends" admits any
 * friend, "close_friends" admits friends the author starred. Anything else
 * (such as "private") admits nobody. Combine with a friendship check.
 */
function friendsOrCloseFriends(audience: PgColumn, author: PgColumn, viewerId: Viewer): SQL {
  return sql`(${audience} = 'friends'
    or (${audience} = 'close_friends' and exists (
      select 1 from ${closeFriends}
      where ${closeFriends.ownerId} = ${author} and ${closeFriends.friendId} = ${viewerId})))`;
}

/**
 * Friends' stories, check-ins and other audience-scoped content the viewer may
 * see: the author is a friend and the item's audience includes the viewer.
 */
export function friendContentFilter(author: PgColumn, audience: PgColumn, viewerId: Viewer): SQL {
  return and(friendAuthorFilter(author, viewerId), friendsOrCloseFriends(audience, author, viewerId))!;
}

/** Friends' visits the viewer may see. Used for the feed and friends-only views. */
export function friendVisitFilter(viewerId: Viewer): SQL {
  return and(friendAuthorFilter(visits.userId, viewerId), audienceAdmits(viewerId))!;
}

/** True when this visit is visible to the viewer as a friend (not as its author). */
export function visitVisibleTo(visitId: string, viewerId: Viewer): SQL {
  return sql`exists (select 1 from ${visits} where ${visits.id} = ${visitId} and ${friendVisitFilter(viewerId)})`;
}

/**
 * Visits every one of the author's friends may see. Used where results are shown
 * to a group whose members aren't all close friends (challenge leaderboards).
 */
export function sharedWithAllFriends(): SQL {
  return eq(visits.audience, 'friends');
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
