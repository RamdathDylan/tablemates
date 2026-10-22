import { fileURLToPath } from 'node:url';

import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { createDb } from './client';

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(url: string) {
  const { db, close } = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
