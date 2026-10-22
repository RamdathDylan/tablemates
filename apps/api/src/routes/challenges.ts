/** Friend challenges: invite friends, race to a target, see the leaderboard. */
import { challengeInput, challengeMembersInput, type Challenge, type ChallengeSummary } from '@tablemates/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { challengeMembers, challenges, users } from '../db/schema';
import type { Deps } from '../deps';
import { challengeCounts } from '../lib/challenges';
import { badRequest, forbidden, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { toPublicUser } from '../lib/serialize';
import { relationshipsWith } from '../lib/visibility';

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };
type ChallengeRow = typeof challenges.$inferSelect;
type MemberRow = typeof challengeMembers.$inferSelect;

/** The challenge and the viewer's membership; 404 for anyone not invited. */
async function memberChallenge(db: Db, viewerId: string, id: string) {
  const [row] = await db
    .select({ challenge: challenges, member: challengeMembers })
    .from(challenges)
    .innerJoin(challengeMembers, and(eq(challengeMembers.challengeId, challenges.id), eq(challengeMembers.userId, viewerId)))
    .where(eq(challenges.id, id));
  if (!row) throw notFound('Challenge not found');
  return row;
}

async function summaries(db: Db, viewerId: string, rows: { challenge: ChallengeRow; member: MemberRow }[]): Promise<ChallengeSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.challenge.id);
  const memberCounts = await db
    .select({ id: challengeMembers.challengeId, n: count() })
    .from(challengeMembers)
    .where(and(inArray(challengeMembers.challengeId, ids), eq(challengeMembers.status, 'joined')))
    .groupBy(challengeMembers.challengeId);
  return Promise.all(
    rows.map(async ({ challenge: c, member }) => ({
      id: c.id,
      title: c.title,
      metric: c.metric,
      target: c.target,
      startsOn: c.startsOn,
      endsOn: c.endsOn,
      ended: c.endedAt !== null,
      status: member.status,
      mine: member.status === 'joined' ? ((await challengeCounts(db, c, [viewerId])).get(viewerId) ?? 0) : 0,
      memberCount: memberCounts.find((m) => m.id === c.id)?.n ?? 0,
    })),
  );
}

async function requireFriends(db: Db, ownerId: string, ids: string[]) {
  const rels = await relationshipsWith(db, ownerId, ids);
  if (ids.some((id) => rels.get(id)?.status !== 'friends')) throw badRequest('You can only invite friends');
}

export function challengeRoutes(app: FastifyInstance, { db }: Deps) {
  /** Challenges you've joined or been invited to, live ones first. */
  app.get('/challenges', async (req): Promise<ChallengeSummary[]> => {
    const rows = await db
      .select({ challenge: challenges, member: challengeMembers })
      .from(challenges)
      .innerJoin(challengeMembers, and(eq(challengeMembers.challengeId, challenges.id), eq(challengeMembers.userId, req.userId)))
      .orderBy(desc(challenges.endsOn))
      .limit(30);
    const list = await summaries(db, req.userId, rows);
    return list.sort((a, b) => Number(a.ended) - Number(b.ended));
  });

  app.post('/challenges', async (req, reply) => {
    const input = parse(challengeInput, req.body);
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== req.userId);
    if (!memberIds.length) throw badRequest('Invite at least one friend');
    await requireFriends(db, req.userId, memberIds);
    const created = await db.transaction(async (tx) => {
      const [c] = await tx
        .insert(challenges)
        .values({ creatorId: req.userId, title: input.title, metric: input.metric, target: input.target, startsOn: input.startsOn, endsOn: input.endsOn })
        .returning();
      await tx.insert(challengeMembers).values([
        { challengeId: c!.id, userId: req.userId, status: 'joined' as const },
        ...memberIds.map((userId) => ({ challengeId: c!.id, userId })),
      ]);
      await notify(tx, memberIds.map((userId) => ({ userId, type: 'challenge_invite' as const, actorId: req.userId, challengeId: c!.id })));
      return c!;
    });
    reply.status(201);
    return { id: created.id };
  });

  app.get('/challenges/:id', async (req): Promise<Challenge> => {
    const row = await memberChallenge(db, req.userId, idParam(req.params));
    const c = row.challenge;
    const people = await db
      .select({ member: challengeMembers, user: userColumns })
      .from(challengeMembers)
      .innerJoin(users, eq(challengeMembers.userId, users.id))
      .where(eq(challengeMembers.challengeId, c.id));
    const joined = people.filter((p) => p.member.status === 'joined');
    const counts = await challengeCounts(db, c, joined.map((p) => p.user.id));
    const [creator] = await db.select(userColumns).from(users).where(eq(users.id, c.creatorId));
    const [summary] = await summaries(db, req.userId, [row]);
    return {
      ...summary!,
      creator: toPublicUser(creator!),
      isCreator: c.creatorId === req.userId,
      leaderboard: joined
        .map((p) => ({ user: toPublicUser(p.user), count: counts.get(p.user.id) ?? 0, completed: p.member.completedAt !== null }))
        .sort((a, b) => b.count - a.count || a.user.displayName.localeCompare(b.user.displayName)),
      invited: people.filter((p) => p.member.status === 'invited').map((p) => toPublicUser(p.user)),
    };
  });

  app.post('/challenges/:id/join', async (req, reply) => {
    const { challenge } = await memberChallenge(db, req.userId, idParam(req.params));
    if (challenge.endedAt) throw badRequest('This challenge is over');
    await db
      .update(challengeMembers)
      .set({ status: 'joined', joinedAt: new Date() })
      .where(and(eq(challengeMembers.challengeId, challenge.id), eq(challengeMembers.userId, req.userId)));
    return reply.status(204).send();
  });

  /** Leave (or decline). The creator can't leave their own challenge. */
  app.post('/challenges/:id/leave', async (req, reply) => {
    const { challenge } = await memberChallenge(db, req.userId, idParam(req.params));
    if (challenge.creatorId === req.userId) throw badRequest("You started this challenge, so you can't leave it");
    await db.delete(challengeMembers).where(and(eq(challengeMembers.challengeId, challenge.id), eq(challengeMembers.userId, req.userId)));
    return reply.status(204).send();
  });

  app.post('/challenges/:id/members', async (req) => {
    const { challenge } = await memberChallenge(db, req.userId, idParam(req.params));
    if (challenge.creatorId !== req.userId) throw forbidden('Only the creator can invite people');
    if (challenge.endedAt) throw badRequest('This challenge is over');
    const { userIds } = parse(challengeMembersInput, req.body);
    const existing = await db.select({ id: challengeMembers.userId }).from(challengeMembers).where(eq(challengeMembers.challengeId, challenge.id));
    const added = [...new Set(userIds)].filter((id) => !existing.some((e) => e.id === id));
    await requireFriends(db, req.userId, added);
    if (added.length) {
      await db.transaction(async (tx) => {
        await tx.insert(challengeMembers).values(added.map((userId) => ({ challengeId: challenge.id, userId }))).onConflictDoNothing();
        await notify(tx, added.map((userId) => ({ userId, type: 'challenge_invite' as const, actorId: req.userId, challengeId: challenge.id })));
      });
    }
    return { added: added.length };
  });
}
