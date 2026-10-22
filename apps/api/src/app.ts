import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';

import type { Deps } from './deps';
import { AppError, isUniqueViolation, unauthorized } from './lib/errors';
import { authRoutes } from './routes/auth';
import { feedRoutes } from './routes/feed';
import { friendRoutes } from './routes/friends';
import { placeRoutes } from './routes/places';
import { userRoutes } from './routes/users';
import { visitRoutes } from './routes/visits';

export interface AppOptions extends Deps {
  corsOrigins: string[];
  logger?: boolean;
}

export async function buildApp({ corsOrigins, logger = false, ...deps }: AppOptions) {
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
    // The plugin only allows GET/HEAD/POST by default; profile edits and removals need the rest.
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  await app.register(cookie);

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
        .send({ error: 'bad_request', message: (err as Error).message });
    }
    req.log.error(err);
    return reply.status(500).send({ error: 'internal', message: 'Something went wrong' });
  });

  app.get('/health', async () => ({ ok: true }));

  authRoutes(app, deps);

  await app.register(async (authed) => {
    authed.decorateRequest('userId', '');
    authed.addHook('preHandler', async (req) => {
      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) throw unauthorized();
      req.userId = await deps.tokens.verifyAccess(header.slice(7));
    });
    userRoutes(authed, deps);
    friendRoutes(authed, deps);
    placeRoutes(authed, deps);
    visitRoutes(authed, deps);
    feedRoutes(authed, deps);
  });

  return app;
}
