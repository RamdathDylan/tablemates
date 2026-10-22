import type { Db } from './db/client';
import type { TokenService } from './lib/tokens';
import type { PlacesProvider } from './places/types';

export interface Deps {
  db: Db;
  tokens: TokenService;
  places: PlacesProvider;
  cookieSecure: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the requireAuth hook on authenticated routes. */
    userId: string;
  }
}
