import { z } from 'zod';

import { notFound } from './errors';

const uuid = z.uuid();

/** Reads a uuid route param; a malformed id is treated as "not found". */
export function idParam(params: unknown, name = 'id'): string {
  const value = (params as Record<string, unknown>)[name];
  const result = uuid.safeParse(value);
  if (!result.success) throw notFound();
  return result.data;
}
