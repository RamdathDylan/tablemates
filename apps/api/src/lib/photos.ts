import type { Photo } from '@tablemates/shared';
import { and, asc, eq, inArray, lt } from 'drizzle-orm';

import type { Db } from '../db/client';
import { photos, reviewPhotos } from '../db/schema';
import type { Storage } from '../storage/types';
import { badRequest } from './errors';

type Tx = Pick<Db, 'insert' | 'delete' | 'select'>;
type PhotoRow = typeof photos.$inferSelect;

export async function signPhoto(storage: Storage, row: PhotoRow): Promise<Photo> {
  return { id: row.id, url: await storage.presignGet(row.storageKey), width: row.width, height: row.height };
}

/**
 * Ready photos the user uploaded for this purpose, in the order given.
 * Anything else (someone else's photo, unconfirmed, wrong kind) is rejected.
 */
export async function ownReadyPhotos(tx: Pick<Db, 'select'>, userId: string, ids: string[], kind: PhotoRow['kind']) {
  if (!ids.length) return [];
  const rows = await tx
    .select()
    .from(photos)
    .where(and(inArray(photos.id, ids), eq(photos.ownerId, userId), eq(photos.kind, kind), eq(photos.status, 'ready')));
  if (rows.length !== new Set(ids).size) throw badRequest('Some photos are missing or still uploading');
  return ids.map((id) => rows.find((r) => r.id === id)!);
}

/** Replaces a review's photos. */
export async function setReviewPhotos(tx: Tx, userId: string, reviewId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  await ownReadyPhotos(tx, userId, unique, 'review');
  await tx.delete(reviewPhotos).where(eq(reviewPhotos.reviewId, reviewId));
  if (unique.length) await tx.insert(reviewPhotos).values(unique.map((photoId, position) => ({ reviewId, photoId, position })));
}

/** Signed photos for many reviews. Only call with reviews the viewer may see. */
export async function photosFor(db: Pick<Db, 'select'>, storage: Storage, reviewIds: string[]): Promise<Map<string, Photo[]>> {
  const result = new Map<string, Photo[]>(reviewIds.map((id) => [id, []]));
  if (!reviewIds.length) return result;
  const rows = await db
    .select({ reviewId: reviewPhotos.reviewId, photo: photos })
    .from(reviewPhotos)
    .innerJoin(photos, eq(reviewPhotos.photoId, photos.id))
    .where(inArray(reviewPhotos.reviewId, reviewIds))
    .orderBy(asc(reviewPhotos.position));
  const signed = await Promise.all(rows.map((r) => signPhoto(storage, r.photo)));
  rows.forEach((r, i) => result.get(r.reviewId)!.push(signed[i]!));
  return result;
}

/** Deletes uploads never confirmed within a day (abandoned picks). */
export async function cleanUpPendingPhotos(db: Db, storage: Storage, olderThan = new Date(Date.now() - 86_400_000)) {
  const stale = await db
    .select({ id: photos.id, key: photos.storageKey })
    .from(photos)
    .where(and(eq(photos.status, 'pending'), lt(photos.createdAt, olderThan)));
  if (!stale.length) return 0;
  await storage.delete(stale.map((s) => s.key));
  await db.delete(photos).where(inArray(photos.id, stale.map((s) => s.id)));
  return stale.length;
}
