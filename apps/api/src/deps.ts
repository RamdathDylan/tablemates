import type { Db } from './db/client';
import type { TokenService } from './lib/tokens';
import type { VerificationService } from './lib/verification';
import type { PlacesProvider } from './places/types';

export interface Deps {
  db: Db;
  tokens: TokenService;
  places: PlacesProvider;
  verification: VerificationService;
  cookieSecure: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the requireAuth hook on authenticated routes. */
    userId: string;
    emailVerified: boolean;
  }
}
