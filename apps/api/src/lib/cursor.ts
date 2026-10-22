import { badRequest } from './errors';

/** Opaque keyset cursor over (createdAt desc, id desc). */
export function encodeCursor(createdAt: Date, id: string) {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const [ts, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const createdAt = new Date(ts ?? '');
  if (!id || Number.isNaN(createdAt.getTime())) throw badRequest('Invalid cursor');
  return { createdAt, id };
}
