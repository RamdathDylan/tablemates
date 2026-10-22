import { env } from '../env';
import { runMigrations } from './migrator';

await runMigrations(env.databaseUrl);
console.log('Migrations applied');
