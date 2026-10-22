import { createHash, randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';
import { jwtVerify, SignJWT } from 'jose';

import type { Db } from '../db/client';
import { refreshTokens } from '../db/schema';
import { unauthorized } from './errors';

const ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export class TokenService {
  private key: Uint8Array;

  constructor(
    private db: Db,
    secret: string,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  /** `emailVerified` travels in the token so gated routes don't need a database lookup. */
  signAccess(userId: string, emailVerified: boolean) {
    return new SignJWT({ ev: emailVerified })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TTL)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<{ userId: string; emailVerified: boolean }> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      // Tokens minted before verification existed lack `ev`; a 401 makes the client refresh into a new one.
      if (!payload.sub || typeof payload.ev !== 'boolean') throw new Error('outdated token');
      return { userId: payload.sub, emailVerified: payload.ev };
    } catch {
      throw unauthorized('Your session has expired');
    }
  }

  async issueRefresh(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(refreshTokens).values({
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    return token;
  }

  /**
   * Exchanges a refresh token for a new one (rotation). Presenting a token that
   * was already rotated means it may have been stolen, so every session for
   * that user is revoked.
   */
  async rotate(token: string): Promise<{ userId: string; refreshToken: string }> {
    const [row] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash(token)));
    if (!row) throw unauthorized();
    if (row.revokedAt) {
      await this.revokeAll(row.userId);
      throw unauthorized();
    }
    if (row.expiresAt < new Date()) throw unauthorized('Your session has expired');

    const [revoked] = await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
      .returning({ id: refreshTokens.id });
    // Lost a race with a concurrent rotation of the same token.
    if (!revoked) throw unauthorized();

    return { userId: row.userId, refreshToken: await this.issueRefresh(row.userId) };
  }

  async revoke(token: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, hash(token)), isNull(refreshTokens.revokedAt)));
  }

  async revokeAll(userId: string) {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}

function hash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
