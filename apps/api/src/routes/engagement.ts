/** Reactions and comments on reviews. Only people who can see a review can respond to it. */
import { commentInput, reactionKinds, type Comment, type Engagement } from '@tablemates/shared';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Db } from '../db/client';
import { comments, reactions, reviews, users, visits } from '../db/schema';
import type { Deps } from '../deps';
import { forbidden, notFound, parse } from '../lib/errors';
import { notify } from '../lib/notify';
import { idParam } from '../lib/params';
import { toPublicUser } from '../lib/serialize';
import { visibleVisitFilter } from '../lib/visibility';

/** The review, if the viewer is allowed to see it; otherwise 404 (never confirm it exists). */
async function visibleReview(db: Db, viewerId: string, reviewId: string) {
  const [row] = await db
    .select({ id: reviews.id, authorId: visits.userId, restaurantId: visits.restaurantId })
    .from(reviews)
    .innerJoin(visits, eq(reviews.visitId, visits.id))
    .where(and(eq(reviews.id, reviewId), visibleVisitFilter(viewerId)));
  if (!row) throw notFound('Review not found');
  return row;
}

/** Reaction and comment counts for a set of reviews, in two grouped queries. */
export async function engagementFor(db: Db, viewerId: string, reviewIds: string[]): Promise<Map<string, Engagement>> {
  const result = new Map<string, Engagement>(
    reviewIds.map((id) => [id, { yum: 0, going: 0, mine: [], comments: 0 }]),
  );
  if (!reviewIds.length) return result;
  const [reactionRows, commentRows] = await Promise.all([
    db
      .select({ reviewId: reactions.reviewId, kind: reactions.kind, userId: reactions.userId })
      .from(reactions)
      .where(inArray(reactions.reviewId, reviewIds)),
    db
      .select({ reviewId: comments.reviewId, n: count() })
      .from(comments)
      .where(inArray(comments.reviewId, reviewIds))
      .groupBy(comments.reviewId),
  ]);
  for (const r of reactionRows) {
    const e = result.get(r.reviewId)!;
    e[r.kind]++;
    if (r.userId === viewerId) e.mine.push(r.kind);
  }
  for (const c of commentRows) result.get(c.reviewId)!.comments = c.n;
  return result;
}

const kindParam = z.object({ kind: z.enum(reactionKinds) });

export function engagementRoutes(app: FastifyInstance, { db }: Deps) {
  app.put('/reviews/:id/reactions/:kind', async (req, reply) => {
    const review = await visibleReview(db, req.userId, idParam(req.params));
    const { kind } = parse(kindParam, req.params);
    await db.transaction(async (tx) => {
      const [added] = await tx
        .insert(reactions)
        .values({ reviewId: review.id, userId: req.userId, kind })
        .onConflictDoNothing()
        .returning({ kind: reactions.kind });
      // Only a new reaction notifies; repeating the request is a no-op.
      if (added) {
        await notify(tx, {
          userId: review.authorId,
          type: 'reaction',
          actorId: req.userId,
          reviewId: review.id,
          restaurantId: review.restaurantId,
          reaction: kind,
        });
      }
    });
    return reply.status(204).send();
  });

  app.delete('/reviews/:id/reactions/:kind', async (req, reply) => {
    const review = await visibleReview(db, req.userId, idParam(req.params));
    const { kind } = parse(kindParam, req.params);
    await db
      .delete(reactions)
      .where(and(eq(reactions.reviewId, review.id), eq(reactions.userId, req.userId), eq(reactions.kind, kind)));
    return reply.status(204).send();
  });

  app.get('/reviews/:id/comments', async (req): Promise<Comment[]> => {
    const review = await visibleReview(db, req.userId, idParam(req.params));
    const rows = await db
      .select({
        comment: comments,
        author: { id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl },
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorId, users.id))
      .where(eq(comments.reviewId, review.id))
      .orderBy(asc(comments.createdAt))
      .limit(200);
    return rows.map(({ comment, author }) => ({
      id: comment.id,
      author: toPublicUser(author),
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      canDelete: comment.authorId === req.userId || review.authorId === req.userId,
    }));
  });

  app.post('/reviews/:id/comments', async (req, reply) => {
    const review = await visibleReview(db, req.userId, idParam(req.params));
    const { body } = parse(commentInput, req.body);
    const created = await db.transaction(async (tx) => {
      const [comment] = await tx.insert(comments).values({ reviewId: review.id, authorId: req.userId, body }).returning();
      // Tell the review's author and everyone else already in the thread.
      const earlier = await tx
        .selectDistinct({ authorId: comments.authorId })
        .from(comments)
        .where(eq(comments.reviewId, review.id));
      const recipients = new Set([review.authorId, ...earlier.map((c) => c.authorId)]);
      await notify(
        tx,
        [...recipients].map((userId) => ({
          userId,
          type: 'comment' as const,
          actorId: req.userId,
          reviewId: review.id,
          restaurantId: review.restaurantId,
          commentId: comment!.id,
        })),
      );
      return comment!;
    });
    reply.status(201);
    return { id: created.id };
  });

  /** The comment's author, or the owner of the review it's on, can delete it. */
  app.delete('/comments/:id', async (req, reply) => {
    const [row] = await db
      .select({ id: comments.id, authorId: comments.authorId, reviewAuthorId: visits.userId })
      .from(comments)
      .innerJoin(reviews, eq(comments.reviewId, reviews.id))
      .innerJoin(visits, eq(reviews.visitId, visits.id))
      .where(eq(comments.id, idParam(req.params)));
    if (!row) throw notFound('Comment not found');
    if (row.authorId !== req.userId && row.reviewAuthorId !== req.userId) throw forbidden();
    await db.delete(comments).where(eq(comments.id, row.id));
    return reply.status(204).send();
  });
}
