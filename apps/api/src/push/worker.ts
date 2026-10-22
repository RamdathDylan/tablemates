import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import type { Db } from '../db/client';
import { notifications, plans, pushTokens, restaurants, tables, users } from '../db/schema';
import { badgeTitle } from '../lib/badges';
import type { PushMessage, PushProvider } from './types';

/** Alerts older than this when first seen are skipped rather than pushed late. */
const MAX_AGE_MS = 60 * 60 * 1000;

type Row = {
  id: string;
  userId: string;
  type: (typeof notifications.$inferSelect)['type'];
  actorName: string;
  actorUsername: string;
  restaurantId: string | null;
  restaurantName: string | null;
  planId: string | null;
  planTitle: string | null;
  tableId: string | null;
  tableName: string | null;
  badgeKey: string | null;
  emoji: string | null;
  count: number | null;
};

/** Notification copy. Kept short: lock screens truncate. */
export function pushContent(n: Row): Pick<PushMessage, 'title' | 'body' | 'data'> {
  switch (n.type) {
    case 'friend_request':
      return { title: 'New friend request', body: `${n.actorName} wants to be friends`, data: { type: n.type, username: n.actorUsername } };
    case 'friend_accepted':
      return { title: 'You have a new friend', body: `${n.actorName} accepted your friend request`, data: { type: n.type, username: n.actorUsername } };
    case 'reaction':
      return {
        title: n.restaurantName ?? 'Your review',
        body: `${n.actorName} reacted to your review`,
        data: { type: n.type, restaurantId: n.restaurantId ?? '' },
      };
    case 'comment':
      return {
        title: n.restaurantName ?? 'New comment',
        body: `${n.actorName} commented on a review`,
        data: { type: n.type, restaurantId: n.restaurantId ?? '' },
      };
    case 'tagged':
      return {
        title: n.restaurantName ?? 'You were tagged',
        body: `${n.actorName} tagged you. Add your rating?`,
        data: { type: n.type, screen: 'tagged' },
      };
    case 'ask_reply':
      return {
        title: 'Your friends answered',
        body: `${n.actorName} suggested ${n.restaurantName ?? 'a place'}`,
        data: { type: n.type, screen: 'feed' },
      };
    case 'plan_invite':
      return {
        title: n.planTitle ?? 'Dinner plans',
        body: `${n.actorName} invited you. Suggest a place and vote`,
        data: { type: n.type, planId: n.planId ?? '' },
      };
    case 'plan_decided':
      return {
        title: n.planTitle ?? 'Dinner plans',
        body: `It's ${n.restaurantName ?? 'decided'}!`,
        data: { type: n.type, planId: n.planId ?? '' },
      };
    case 'streak_nudge':
      return {
        title: n.count ? `🔥 Keep your ${n.count}-week streak` : '🔥 Keep your streak',
        body: 'Log a meal today to keep it going.',
        data: { type: n.type, screen: 'log' },
      };
    case 'checkin':
      return {
        title: `${n.actorName} is out now`,
        body: `At ${n.restaurantName ?? 'a restaurant'}. Swing by?`,
        data: { type: n.type, restaurantId: n.restaurantId ?? '' },
      };
    case 'table_invite':
      return {
        title: n.tableName ?? 'New table',
        body: `${n.actorName} added you to their table`,
        data: { type: n.type, tableId: n.tableId ?? '' },
      };
    case 'badge':
      return { title: 'New badge!', body: `You earned ${badgeTitle(n.badgeKey ?? '')}`, data: { type: n.type, screen: 'passport' } };
    case 'story_reaction':
      return { title: 'Story reaction', body: `${n.actorName} reacted ${n.emoji ?? ''} to your story`, data: { type: n.type, screen: 'feed' } };
    case 'plate_prompt':
      return { title: '📸 Plate check!', body: "Show friends what you're eating. 5 minutes to be on time.", data: { type: n.type, screen: 'feed' } };
    case 'saved_place_reviewed':
      return {
        title: n.restaurantName ?? 'A place you saved',
        body: `${n.actorName} just reviewed it`,
        data: { type: n.type, restaurantId: n.restaurantId ?? '' },
      };
  }
}

/**
 * Outbox worker: sends pushes for notifications that committed, then marks
 * them pushed. Running after commit means a rolled-back change never pushes.
 * The job runner (jobs/runner.ts) calls runOnce on an interval.
 */
export class PushWorker {
  constructor(
    private db: Db,
    private provider: PushProvider,
  ) {}

  /** Processes one batch. Returns how many messages were sent. */
  async runOnce(): Promise<number> {
    const pending: Row[] = await this.db
      .select({
        id: notifications.id,
        userId: notifications.userId,
        type: notifications.type,
        actorName: users.displayName,
        actorUsername: users.username,
        restaurantId: notifications.restaurantId,
        restaurantName: restaurants.name,
        planId: notifications.planId,
        planTitle: plans.title,
        tableId: notifications.tableId,
        tableName: tables.name,
        badgeKey: notifications.badgeKey,
        emoji: notifications.emoji,
        count: notifications.count,
      })
      .from(notifications)
      .innerJoin(users, eq(notifications.actorId, users.id))
      .leftJoin(restaurants, eq(notifications.restaurantId, restaurants.id))
      .leftJoin(plans, eq(notifications.planId, plans.id))
      .leftJoin(tables, eq(notifications.tableId, tables.id))
      .where(and(isNull(notifications.pushedAt), gt(notifications.createdAt, new Date(Date.now() - MAX_AGE_MS))))
      .limit(500);
    if (!pending.length) return 0;

    // Claim the batch first so a second worker can't double-send.
    const claimed = await this.db
      .update(notifications)
      .set({ pushedAt: new Date() })
      .where(and(inArray(notifications.id, pending.map((p) => p.id)), isNull(notifications.pushedAt)))
      .returning({ id: notifications.id });
    const claimedIds = new Set(claimed.map((c) => c.id));
    const batch = pending.filter((p) => claimedIds.has(p.id));

    const recipients = [...new Set(batch.map((p) => p.userId))];
    const [tokens, muted] = await Promise.all([
      this.db.select().from(pushTokens).where(inArray(pushTokens.userId, recipients)),
      this.db.select({ id: users.id, muted: users.mutedPushTypes }).from(users).where(inArray(users.id, recipients)),
    ]);
    const mutedBy = new Map(muted.map((m) => [m.id, new Set(m.muted)]));

    const messages: PushMessage[] = [];
    for (const n of batch) {
      if (mutedBy.get(n.userId)?.has(n.type)) continue;
      for (const t of tokens.filter((t) => t.userId === n.userId)) {
        messages.push({ to: t.token, ...pushContent(n) });
      }
    }
    if (!messages.length) return 0;

    const results = await this.provider.send(messages);
    const gone = messages.filter((_, i) => {
      const r = results[i];
      return r && !r.ok && r.deviceGone;
    });
    if (gone.length) {
      await this.db.delete(pushTokens).where(inArray(pushTokens.token, gone.map((m) => m.to)));
    }
    return messages.length;
  }
}

