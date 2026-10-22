import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { emailVerificationCodes, users } from '../db/schema';
import { verificationEmail } from '../mail/templates';
import type { Mailer } from '../mail/types';
import { AppError, badRequest } from './errors';

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export class VerificationService {
  constructor(
    private db: Db,
    private mailer: Mailer,
    private secret: string,
  ) {}

  private hash(userId: string, code: string) {
    return createHmac('sha256', this.secret).update(`${userId}:${code}`).digest('hex');
  }

  /** Emails a fresh 6-digit code, replacing any previous one. */
  async sendCode(user: { id: string; email: string; displayName: string }) {
    const [existing] = await this.db
      .select({ lastSentAt: emailVerificationCodes.lastSentAt })
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, user.id));
    const wait = existing ? existing.lastSentAt.getTime() + RESEND_COOLDOWN_MS - Date.now() : 0;
    if (wait > 0) {
      throw new AppError(429, 'too_soon', `Wait ${Math.ceil(wait / 1000)} seconds before requesting another code`);
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const values = {
      codeHash: this.hash(user.id, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
    };
    await this.db
      .insert(emailVerificationCodes)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: emailVerificationCodes.userId, set: values });
    await this.mailer.send(verificationEmail(user.email, user.displayName, code));
  }

  /** Checks a code and marks the email verified. Wrong codes count toward a lockout. */
  async verify(userId: string, code: string) {
    const [row] = await this.db
      .select()
      .from(emailVerificationCodes)
      .where(eq(emailVerificationCodes.userId, userId));
    if (!row) throw badRequest('Request a new code to verify your email');
    if (row.expiresAt < new Date()) throw badRequest('That code has expired. Request a new one.');
    if (row.attempts >= MAX_ATTEMPTS) {
      throw new AppError(429, 'too_many_attempts', 'Too many incorrect codes. Request a new one.');
    }

    const expected = Buffer.from(row.codeHash, 'hex');
    const actual = Buffer.from(this.hash(userId, code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      await this.db
        .update(emailVerificationCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(emailVerificationCodes.userId, userId));
      const left = MAX_ATTEMPTS - row.attempts - 1;
      throw badRequest(left > 0 ? `Incorrect code. ${left} tr${left === 1 ? 'y' : 'ies'} left.` : 'Incorrect code. Request a new one.');
    }

    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
      await tx.delete(emailVerificationCodes).where(eq(emailVerificationCodes.userId, userId));
    });
  }
}
