import { buildApp } from './app';
import { createDb } from './db/client';
import { env } from './env';
import { TokenService } from './lib/tokens';
import { GooglePlacesProvider } from './places/google';

const { db } = createDb(env.databaseUrl);
const app = await buildApp({
  db,
  tokens: new TokenService(db, env.jwtSecret),
  places: new GooglePlacesProvider(env.googlePlacesApiKey),
  cookieSecure: env.isProduction,
  corsOrigins: env.corsOrigins,
  logger: true,
});

if (!env.googlePlacesApiKey) {
  app.log.warn('GOOGLE_PLACES_API_KEY is not set; restaurant search will return 503');
}

await app.listen({ port: env.port, host: '0.0.0.0' });
