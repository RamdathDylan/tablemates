import { buildApp } from './app';
import { createDb } from './db/client';
import { env } from './env';
import { TokenService } from './lib/tokens';
import { VerificationService } from './lib/verification';
import { MailpitMailer, ResendMailer } from './mail/providers';
import { GooglePlacesProvider } from './places/google';
import { ExpoPushProvider } from './push/expo';
import { PushWorker } from './push/worker';

function createMailer() {
  const { provider, resendApiKey, mailpitUrl, from } = env.mail;
  if (provider === 'resend') {
    if (!resendApiKey) throw new Error('MAIL_PROVIDER=resend needs RESEND_API_KEY');
    return new ResendMailer(resendApiKey, from);
  }
  return new MailpitMailer(mailpitUrl, from);
}

const { db } = createDb(env.databaseUrl);
const app = await buildApp({
  db,
  tokens: new TokenService(db, env.jwtSecret),
  places: new GooglePlacesProvider(env.googlePlacesApiKey),
  verification: new VerificationService(db, createMailer(), env.jwtSecret),
  cookieSecure: env.isProduction,
  corsOrigins: env.corsOrigins,
  logger: true,
});

if (!env.googlePlacesApiKey) {
  app.log.warn('GOOGLE_PLACES_API_KEY is not set; restaurant search will return 503');
}

app.log.info(`Sending email via ${env.mail.provider}`);

// Delivers pushes for committed notifications (see push/worker.ts).
new PushWorker(db, new ExpoPushProvider(env.expoAccessToken), app.log).start();

await app.listen({ port: env.port, host: '0.0.0.0' });
