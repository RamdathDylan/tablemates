import postgres from 'postgres';

import { runMigrations } from '../src/db/migrator';
import { testDatabaseUrl } from './helpers';

/**
 * Migrates a brand-new database from scratch, then drops it. The shared test
 * database is migrated one release at a time, so this is what catches a
 * migration that only fails when every migration runs in a single transaction,
 * as on a new install or a first deploy.
 */
async function checkMigrationsFromScratch(url: string) {
  const name = `tablemates_migration_check_${process.pid}`;
  const admin = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${name}`);
    await admin.unsafe(`create database ${name}`);
    const fresh = new URL(url);
    fresh.pathname = `/${name}`;
    await runMigrations(fresh.toString());
  } catch (err) {
    // Print the reason directly: vitest can crash while formatting errors thrown
    // from global setup, and then reports only "No test files found".
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err);
    console.error(`\nMigrations fail on a fresh database: ${cause}\n`);
    throw new Error(`Migrations fail on a fresh database: ${cause}`);
  } finally {
    await admin.unsafe(`drop database if exists ${name}`);
    await admin.end();
  }
}

export default async function setup() {
  const url = testDatabaseUrl();
  await checkMigrationsFromScratch(url);
  await runMigrations(url);
}
