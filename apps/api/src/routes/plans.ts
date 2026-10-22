/** Group dinner plans: invite friends, collect options, vote, and lock in a winner. */
import { createPlanInput, decidePlanInput, planOptionInput, type Plan, type PlanSummary } from '@tablemates/shared';
import { and, count, desc, eq, gt, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import type { Db } from '../db/client';
import { planMembers, planOptions, plans, planVotes, restaurants, users } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { toPublicUser, toRestaurant } from '../lib/serialize';
import { relationshipsWith } from '../lib/visibility';
import { ensureRestaurant } from './visits';

const userColumns = { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl };

/** The plan, if the viewer is a member; otherwise 404. */
async function memberPlan(db: Db, viewerId: string, planId: string) {
  const [row] = await db
    .select({ plan: plans })
    .from(plans)
    .innerJoin(planMembers, and(eq(planMembers.planId, plans.id), eq(planMembers.userId, viewerId)))
    .where(eq(plans.id, planId));
  if (!row) throw notFound('Plan not found');
  return row.plan;
}

function requireOpen(plan: typeof plans.$inferSelect) {
  if (plan.status !== 'open') throw badRequest('This plan is already decided');
}

async function summaries(db: Db, planRows: (typeof plans.$inferSelect)[]): Promise<PlanSummary[]> {
  if (!planRows.length) return [];
  const ids = planRows.map((p) => p.id);
  const decidedIds = planRows.flatMap((p) => (p.decidedOptionId ? [p.decidedOptionId] : []));
  const [members, creators, optionCounts, winners] = await Promise.all([
    db
      .select({ planId: planMembers.planId, user: userColumns })
      .from(planMembers)
      .innerJoin(users, eq(planMembers.userId, users.id))
      .where(inArray(planMembers.planId, ids))
      .orderBy(users.displayName),
    db.select(userColumns).from(users).where(inArray(users.id, [...new Set(planRows.map((p) => p.creatorId))])),
    db
      .select({ planId: planOptions.planId, n: count() })
      .from(planOptions)
      .where(inArray(planOptions.planId, ids))
      .groupBy(planOptions.planId),
    decidedIds.length
      ? db
          .select({ optionId: planOptions.id, restaurant: restaurants })
          .from(planOptions)
          .innerJoin(restaurants, eq(planOptions.restaurantId, restaurants.id))
          .where(inArray(planOptions.id, decidedIds))
      : Promise.resolve([]),
  ]);
  return planRows.map((p) => ({
    id: p.id,
    title: p.title,
    startsAt: p.startsAt?.toISOString() ?? null,
    status: p.status,
    creator: toPublicUser(creators.find((c) => c.id === p.creatorId)!),
    members: members.filter((m) => m.planId === p.id).map((m) => toPublicUser(m.user)),
    optionCount: optionCounts.find((o) => o.planId === p.id)?.n ?? 0,
    decided: (() => {
      const w = winners.find((x) => x.optionId === p.decidedOptionId);
      return w ? toRestaurant(w.restaurant) : null;
    })(),
  }));
}

export function planRoutes(app: FastifyInstance, { db, places }: Deps) {
  /** Your open plans, plus ones decided in the last 30 days. */
  app.get('/plans', async (req): Promise<PlanSummary[]> => {
    const rows = await db
      .select({ plan: plans })
      .from(plans)
      .innerJoin(planMembers, and(eq(planMembers.planId, plans.id), eq(planMembers.userId, req.userId)))
      .where(or(eq(plans.status, 'open'), gt(plans.createdAt, new Date(Date.now() - 30 * 86_400_000))))
      .orderBy(desc(plans.createdAt))
      .limit(30);
    return summaries(db, rows.map((r) => r.plan));
  });

  app.post('/plans', async (req, reply) => {
    const input = parse(createPlanInput, req.body);
    const memberIds = [...new Set(input.memberIds)].filter((id) => id !== req.userId);
    const rels = await relationshipsWith(db, req.userId, memberIds);
    if (!memberIds.length || memberIds.some((id) => rels.get(id)?.status !== 'friends')) {
      throw badRequest('You can only invite friends');
    }
    const plan = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(plans)
        .values({ creatorId: req.userId, title: input.title, startsAt: input.startsAt ? new Date(input.startsAt) : null })
        .returning();
      await tx.insert(planMembers).values([req.userId, ...memberIds].map((userId) => ({ planId: created!.id, userId })));
      await notify(tx, memberIds.map((userId) => ({ userId, type: 'plan_invite' as const, actorId: req.userId, planId: created!.id })));
      return created!;
    });
    reply.status(201);
    return { id: plan.id };
  });

  app.get('/plans/:id', async (req): Promise<Plan> => {
    const plan = await memberPlan(db, req.userId, idParam(req.params));
    const [[summary], options] = await Promise.all([
      summaries(db, [plan]),
      db
        .select({ option: planOptions, restaurant: restaurants, addedBy: userColumns })
        .from(planOptions)
        .innerJoin(restaurants, eq(planOptions.restaurantId, restaurants.id))
        .innerJoin(users, eq(planOptions.addedBy, users.id))
        .where(eq(planOptions.planId, plan.id))
        .orderBy(planOptions.createdAt),
    ]);
    const votes = options.length
      ? await db
          .select({ optionId: planVotes.optionId, user: userColumns })
          .from(planVotes)
          .innerJoin(users, eq(planVotes.userId, users.id))
          .where(inArray(planVotes.optionId, options.map((o) => o.option.id)))
      : [];
    return {
      ...summary!,
      isCreator: plan.creatorId === req.userId,
      options: options
        .map(({ option, restaurant, addedBy }) => {
          const voters = votes.filter((v) => v.optionId === option.id).map((v) => toPublicUser(v.user));
          return {
            id: option.id,
            restaurant: toRestaurant(restaurant),
            addedBy: toPublicUser(addedBy),
            voters,
            voted: voters.some((v) => v.id === req.userId),
            canRemove: option.addedBy === req.userId || plan.creatorId === req.userId,
          };
        })
        // Leading options first, so the tally reads top-down.
        .sort((a, b) => b.voters.length - a.voters.length),
    };
  });

  app.post('/plans/:id/options', async (req, reply) => {
    const plan = await memberPlan(db, req.userId, idParam(req.params));
    requireOpen(plan);
    const input = parse(planOptionInput, req.body);
    let restaurantId = input.restaurantId;
    if (!restaurantId) restaurantId = (await ensureRestaurant(db, places, input.googlePlaceId!)).id;
    else {
      const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, restaurantId));
      if (!exists) throw notFound('Restaurant not found');
    }
    try {
      const [option] = await db
        .insert(planOptions)
        .values({ planId: plan.id, restaurantId, addedBy: req.userId })
        .returning({ id: planOptions.id });
      // Suggesting a place counts as voting for it.
      await db.insert(planVotes).values({ optionId: option!.id, userId: req.userId });
      reply.status(201);
      return option;
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict("That place is already in the plan");
      throw err;
    }
  });

  app.delete('/plans/:id/options/:optionId', async (req, reply) => {
    const plan = await memberPlan(db, req.userId, idParam(req.params));
    requireOpen(plan);
    const [option] = await db
      .select()
      .from(planOptions)
      .where(and(eq(planOptions.id, idParam(req.params, 'optionId')), eq(planOptions.planId, plan.id)));
    if (!option) throw notFound('Option not found');
    if (option.addedBy !== req.userId && plan.creatorId !== req.userId) throw forbidden();
    await db.delete(planOptions).where(eq(planOptions.id, option.id));
    return reply.status(204).send();
  });

  async function memberOption(planId: string, optionId: string, userId: string) {
    const plan = await memberPlan(db, userId, planId);
    requireOpen(plan);
    const [option] = await db
      .select({ id: planOptions.id })
      .from(planOptions)
      .where(and(eq(planOptions.id, optionId), eq(planOptions.planId, plan.id)));
    if (!option) throw notFound('Option not found');
    return option;
  }

  app.put('/plans/:id/options/:optionId/vote', async (req, reply) => {
    const option = await memberOption(idParam(req.params), idParam(req.params, 'optionId'), req.userId);
    await db.insert(planVotes).values({ optionId: option.id, userId: req.userId }).onConflictDoNothing();
    return reply.status(204).send();
  });

  app.delete('/plans/:id/options/:optionId/vote', async (req, reply) => {
    const option = await memberOption(idParam(req.params), idParam(req.params, 'optionId'), req.userId);
    await db.delete(planVotes).where(and(eq(planVotes.optionId, option.id), eq(planVotes.userId, req.userId)));
    return reply.status(204).send();
  });

  /** The creator locks in the winner; everyone else is told where they're going. */
  app.post('/plans/:id/decide', async (req) => {
    const plan = await memberPlan(db, req.userId, idParam(req.params));
    if (plan.creatorId !== req.userId) throw forbidden('Only the person who made the plan can decide');
    requireOpen(plan);
    const { optionId } = parse(decidePlanInput, req.body);
    const [option] = await db
      .select()
      .from(planOptions)
      .where(and(eq(planOptions.id, optionId), eq(planOptions.planId, plan.id)));
    if (!option) throw notFound('Option not found');
    await db.transaction(async (tx) => {
      await tx.update(plans).set({ status: 'decided', decidedOptionId: option.id }).where(eq(plans.id, plan.id));
      const members = await tx.select({ userId: planMembers.userId }).from(planMembers).where(eq(planMembers.planId, plan.id));
      await notify(
        tx,
        members.map((m) => ({
          userId: m.userId,
          type: 'plan_decided' as const,
          actorId: req.userId,
          planId: plan.id,
          restaurantId: option.restaurantId,
        })),
      );
    });
    return { status: 'decided' };
  });

  app.post('/plans/:id/leave', async (req, reply) => {
    const plan = await memberPlan(db, req.userId, idParam(req.params));
    if (plan.creatorId === req.userId) throw badRequest("You made this plan, so you can't leave it");
    await db.delete(planMembers).where(and(eq(planMembers.planId, plan.id), eq(planMembers.userId, req.userId)));
    return reply.status(204).send();
  });
}
