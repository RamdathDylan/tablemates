/** Direct-to-storage uploads: the API hands out a signed URL, the app uploads, then confirms. */
import { randomUUID } from 'node:crypto';

import { confirmPhotoInput, MAX_PHOTO_BYTES, uploadInput } from '@tablemates/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { photos } from '../db/schema';
import type { Deps } from '../deps';
import { badRequest, notFound, parse } from '../lib/errors';
import { idParam } from '../lib/params';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function photoRoutes(app: FastifyInstance, { db, storage }: Deps) {
  app.post('/uploads', async (req, reply) => {
    const { kind, contentType, bytes } = parse(uploadInput, req.body);
    const storageKey = `${kind}/${req.userId}/${randomUUID()}.${EXT[contentType]}`;
    const [photo] = await db
      .insert(photos)
      .values({ ownerId: req.userId, kind, storageKey, contentType, bytes })
      .returning({ id: photos.id });
    reply.status(201);
    return {
      photoId: photo!.id,
      uploadUrl: await storage.presignPut(storageKey, contentType, bytes),
      headers: { 'Content-Type': contentType },
    };
  });

  app.post('/photos/:id/confirm', async (req) => {
    const { width, height } = parse(confirmPhotoInput, req.body ?? {});
    const [photo] = await db
      .select()
      .from(photos)
      .where(and(eq(photos.id, idParam(req.params)), eq(photos.ownerId, req.userId)));
    if (!photo) throw notFound('Photo not found');
    if (photo.status === 'ready') return { id: photo.id };
    const object = await storage.head(photo.storageKey);
    if (!object) throw badRequest("The upload didn't arrive. Try again.");
    if (object.bytes > MAX_PHOTO_BYTES) {
      await storage.delete([photo.storageKey]);
      await db.delete(photos).where(eq(photos.id, photo.id));
      throw badRequest('Photos must be 8 MB or smaller');
    }
    await db
      .update(photos)
      .set({ status: 'ready', bytes: object.bytes, width: width ?? null, height: height ?? null })
      .where(eq(photos.id, photo.id));
    return { id: photo.id };
  });
}

/**
 * Public: avatars are profile pictures anyone who can see the profile may see,
 * so they get a stable URL that redirects to a fresh signed link.
 */
export function avatarRoute(app: FastifyInstance, { db, storage }: Deps) {
  app.get('/avatars/:id', async (req, reply) => {
    const [photo] = await db
      .select()
      .from(photos)
      .where(and(eq(photos.id, idParam(req.params)), eq(photos.kind, 'avatar'), eq(photos.status, 'ready')));
    if (!photo) throw notFound('Photo not found');
    reply.header('Cache-Control', 'public, max-age=300');
    return reply.redirect(await storage.presignGet(photo.storageKey, 900), 302);
  });
}
