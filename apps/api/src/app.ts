import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import type { Deps } from './deps';
import { AppError, isUniqueViolation, unauthorized } from './lib/errors';
import { askRoutes } from './routes/asks';
import { checkinRoutes } from './routes/checkins';
import { authRoutes, verificationRoutes, type RateLimit } from './routes/auth';
import { engagementRoutes } from './routes/engagement';
import { feedRoutes } from './routes/feed';
import { friendRoutes } from './routes/friends';
import { listRoutes } from './routes/lists';
import { mapRoutes } from './routes/map';
import { notificationRoutes } from './routes/notifications';
import { savedRoutes } from './routes/saved';
import { storyRoutes } from './routes/stories';
import { tableRoutes } from './routes/tables';
import { avatarRoute, photoRoutes } from './routes/photos';
import { placeRoutes } from './routes/places';
import { plateRoutes } from './routes/plates';
import { planRoutes } from './routes/plans';
import { pushRoutes } from './routes/push';
import { userRoutes } from './routes/users';
import { visitRoutes } from './routes/visits';
import { wrappedRoutes } from './routes/wrapped';

export interface AppOptions extends Deps {
  corsOrigins: string[];
  logger?: boolean;
  /** Per-IP limit on sign-up, login, and verification attempts. */
  authRateLimit?: RateLimit;
}

/** Routes an unverified account may use, so it can finish verifying. */
const UNVERIFIED_ALLOWED = new Set(['GET /me', 'POST /auth/verify-email', 'POST /auth/resend-verification']);

export async function buildApp({
  corsOrigins,
  logger = false,
  authRateLimit = { max: 10, timeWindow: '1 minute' },
  ...deps
}: AppOptions) {
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    // The plugin only allows GET/HEAD/POST by default; profile edits and removals need the rest.
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);
  // Opt-in per route (see routes/auth.ts) rather than limiting every request.
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'validation_error',
        message: err.issues[0]?.message ?? 'Invalid input',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({ error: err.code, message: err.message });
    }
    if (isUniqueViolation(err)) {
      return reply.status(409).send({ error: 'conflict', message: 'That already exists' });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply
        .status(status)
        .send({ error: status === 429 ? 'rate_limited' : 'bad_request', message: (err as Error).message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));

  authRoutes(app, deps, authRateLimit);
  avatarRoute(app, deps);

  await app.register(async (authed) => {
    authed.decorateRequest('userId', '');
    authed.decorateRequest('emailVerified', false);
    authed.addHook('preHandler', async (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      const session = await deps.tokens.verifyAccess(header.slice(7));
      req.userId = session.userId;
      req.emailVerified = session.emailVerified;
      if (!session.emailVerified && !UNVERIFIED_ALLOWED.has(`${req.method} ${req.routeOptions.url}`)) {
        throw new AppError(403, 'email_unverified', 'Verify your email to continue');
      }
    });
    verificationRoutes(authed, deps, authRateLimit);
    userRoutes(authed, deps);
    friendRoutes(authed, deps);
    notificationRoutes(authed, deps);
    placeRoutes(authed, deps);
    visitRoutes(authed, deps);
    feedRoutes(authed, deps);
    engagementRoutes(authed, deps);
    askRoutes(authed, deps);
    planRoutes(authed, deps);
    listRoutes(authed, deps);
    tableRoutes(authed, deps);
    checkinRoutes(authed, deps);
    wrappedRoutes(authed, deps);
    photoRoutes(authed, deps);
    storyRoutes(authed, deps);
    plateRoutes(authed, deps);
    mapRoutes(authed, deps);
    savedRoutes(authed, deps);
    pushRoutes(authed, deps);
  });

  return app;
}
