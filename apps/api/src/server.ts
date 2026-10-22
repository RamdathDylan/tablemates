import { buildApp } from './app';
import { createDb } from './db/client';
import { env } from './env';
import { TokenService } from './lib/tokens';
import { VerificationService } from './lib/verification';
import { MailpitMailer, ResendMailer } from './mail/providers';
import { GooglePlacesProvider } from './places/google';
import { JobRunner } from './jobs/runner';
import { cleanUpPendingPhotos } from './lib/photos';
import { ExpoPushProvider } from './push/expo';
import { PushWorker } from './push/worker';
import { runPlatePrompts } from './routes/plates';
import { expireStories } from './routes/stories';
import { S3Storage } from './storage/s3';

function createMailer() {
  const { provider, resendApiKey, mailpitUrl, from } = env.mail;
  if (provider === 'resend') {
    if (!resendApiKey) throw new Error('MAIL_PROVIDER=resend needs RESEND_API_KEY');
    return new ResendMailer(resendApiKey, from);
  }
  return new MailpitMailer(mailpitUrl, from);
}

const { db } = createDb(env.databaseUrl);
const storage = new S3Storage(env.s3);
const app = await buildApp({
  db,
  tokens: new TokenService(db, env.jwtSecret),
  places: new GooglePlacesProvider(env.googlePlacesApiKey),
  verification: new VerificationService(db, createMailer(), env.jwtSecret),
  storage,
  publicApiUrl: env.publicApiUrl,
  cookieSecure: env.isProduction,
  corsOrigins: env.corsOrigins,
  logger: true,
});

if (!env.googlePlacesApiKey) {
  app.log.warn('GOOGLE_PLACES_API_KEY is not set; restaurant search will return 503');
}

app.log.info(`Sending email via ${env.mail.provider}`);

try {
  await storage.ensureReady(env.corsOrigins);
} catch (err) {
  app.log.warn(err, 'Photo storage is not reachable; uploads will fail until it is (pnpm db:up)');
}

const push = new PushWorker(db, new ExpoPushProvider(env.expoAccessToken));
new JobRunner(
  [
    // Delivers pushes for committed notifications (see push/worker.ts).
    { name: 'push', intervalMs: 2000, run: () => push.runOnce() },
    { name: 'photo-cleanup', intervalMs: 60 * 60 * 1000, run: () => cleanUpPendingPhotos(db, storage) },
    { name: 'plate-prompts', intervalMs: 30 * 1000, run: () => runPlatePrompts(db) },
    { name: 'story-expiry', intervalMs: 5 * 60 * 1000, run: () => expireStories(db, storage) },
  ],
  app.log,
).start();

await app.listen({ port: env.port, host: '0.0.0.0' });
