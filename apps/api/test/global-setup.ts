import { runMigrations } from '../src/db/migrator';
import { testDatabaseUrl } from './helpers';

export default async function setup() {
  await runMigrations(testDatabaseUrl());
}
