import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name} (see .env.example)`);
  return value;
}

export const env = {
  get databaseUrl() {
    return required('DATABASE_URL');
  },
  get jwtSecret() {
    return required('JWT_SECRET');
  },
  googlePlacesApiKey: process.env.GOOGLE_PLACES_API_KEY ?? '',
  port: Number(process.env.PORT ?? 4000),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:8081')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  isProduction: process.env.NODE_ENV === 'production',
  mail: {
    provider: (process.env.MAIL_PROVIDER ?? 'mailpit') as 'mailpit' | 'resend',
    mailpitUrl: process.env.MAILPIT_URL ?? 'http://localhost:8025',
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.MAIL_FROM ?? 'TableMates <onboarding@resend.dev>',
  },
};
