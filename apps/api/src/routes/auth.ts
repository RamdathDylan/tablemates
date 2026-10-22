import { hash, verify } from '@node-rs/argon2';
import { loginInput, refreshInput, signupInput, verifyEmailInput, type AuthResponse } from '@tablemates/shared';
import { eq, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { users } from '../db/schema';
import type { Deps } from '../deps';
import { conflict, isUniqueViolation, notFound, parse, unauthorized } from '../lib/errors';
import { toMe } from '../lib/serialize';

const REFRESH_COOKIE = 'tm_refresh';
const REFRESH_MAX_AGE_S = 30 * 24 * 60 * 60;
// Verified against when the email is unknown, so response time doesn't reveal which emails exist.
const DUMMY_HASH = await hash('timing-safe-placeholder');

/** Web clients keep the refresh token in an httpOnly cookie instead of JS-readable storage. */
const isWebClient = (req: FastifyRequest) => req.headers['x-tablemates-client'] === 'web';

export interface RateLimit {
  max: number;
  timeWindow: string;
}

export function authRoutes(app: FastifyInstance, { db, tokens, verification, cookieSecure }: Deps, limit: RateLimit) {
  // Per-IP limits on endpoints that check secrets, to slow credential stuffing.
  const limited = { config: { rateLimit: limit } };

  async function sendSession(
    req: FastifyRequest,
    reply: FastifyReply,
    user: typeof users.$inferSelect,
    refreshToken?: string,
  ): Promise<AuthResponse> {
    const token = refreshToken ?? (await tokens.issueRefresh(user.id));
    const body: AuthResponse = { user: toMe(user), accessToken: await tokens.signAccess(user.id, user.emailVerifiedAt !== null) };
    if (isWebClient(req)) {
      reply.setCookie(REFRESH_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: cookieSecure,
        path: '/auth',
        maxAge: REFRESH_MAX_AGE_S,
      });
    } else {
      body.refreshToken = token;
    }
    return body;
  }

  app.post('/auth/signup', limited, async (req, reply) => {
    const input = parse(signupInput, req.body);
    const [taken] = await db
      .select({ email: users.email, username: users.username })
      .from(users)
      .where(or(eq(users.email, input.email), eq(users.username, input.username)));
    if (taken) {
      throw conflict(
        taken.email === input.email
          ? 'An account with that email already exists'
          : 'That username is taken',
      );
    }
    try {
      const [user] = await db
        .insert(users)
        .values({
          email: input.email,
          passwordHash: await hash(input.password),
          username: input.username,
          displayName: input.displayName,
        })
        .returning();
      try {
        await verification.sendCode(user!);
      } catch (err) {
        // The account exists either way; the verify screen can resend the code.
        req.log.error(err, 'failed to send verification email');
      }
      reply.status(201);
      return sendSession(req, reply, user!);
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('That email or username is taken');
      throw err;
    }
  });

  app.post('/auth/login', limited, async (req, reply) => {
    const input = parse(loginInput, req.body);
    const [user] = await db.select().from(users).where(eq(users.email, input.email));
    const ok = await verify(user?.passwordHash ?? DUMMY_HASH, input.password);
    if (!user || !ok) throw unauthorized('Incorrect email or password');
    return sendSession(req, reply, user);
  });

  app.post('/auth/refresh', async (req, reply) => {
    const token = parse(refreshInput, req.body ?? {}).refreshToken ?? req.cookies[REFRESH_COOKIE];
    if (!token) throw unauthorized();
    const { userId, refreshToken } = await tokens.rotate(token);
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw unauthorized();
    return sendSession(req, reply, user, refreshToken);
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = parse(refreshInput, req.body ?? {}).refreshToken ?? req.cookies[REFRESH_COOKIE];
    if (token) await tokens.revoke(token);
    reply.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return reply.status(204).send();
  });
}

/** Authenticated: the only routes an unverified account can call (plus GET /me). */
export function verificationRoutes(app: FastifyInstance, { db, tokens, verification }: Deps, limit: RateLimit) {
  const limited = { config: { rateLimit: limit } };

  async function currentUser(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw notFound('User not found');
    return user;
  }

  app.post('/auth/verify-email', limited, async (req) => {
    const { code } = parse(verifyEmailInput, req.body);
    const user = await currentUser(req.userId);
    if (!user.emailVerifiedAt) await verification.verify(user.id, code);
    const verified = await currentUser(req.userId);
    // A fresh access token carries the verified claim, so gated routes open immediately.
    return { user: toMe(verified), accessToken: await tokens.signAccess(verified.id, true) };
  });

  app.post('/auth/resend-verification', limited, async (req, reply) => {
    const user = await currentUser(req.userId);
    if (user.emailVerifiedAt) return reply.status(204).send();
    await verification.sendCode(user);
    return reply.status(204).send();
  });
}
