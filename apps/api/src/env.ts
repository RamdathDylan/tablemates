import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

/**
 * Which proxies to trust for the client address (X-Forwarded-For): "false"
 * (default, trust none), "true" (trust all), a hop count, or comma-separated
 * addresses and CIDR ranges. Trust only the proxies you run, or clients could
 * spoof their address and dodge rate limits.
 */
export type TrustProxy = boolean | string[] | ((address: string, hop: number) => boolean);

export function parseTrustProxy(value: string | undefined): TrustProxy {
  const v = (value ?? '').trim();
  if (!v || v === 'false') return false;
  if (v === 'true') return true;
  // A hop count: trust that many proxies in front of the API.
  if (/^\d+$/.test(v)) {
    const hops = Number(v);
    return (_address, hop) => hop < hops;
  }
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

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
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  /** Optional. When set, rate limits are shared across API instances through Redis. */
  redisUrl: process.env.REDIS_URL || undefined,
  /** How clients reach this API; used for public links such as avatar images. */
  publicApiUrl: process.env.PUBLIC_API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.S3_BUCKET ?? 'tablemates-photos',
    region: process.env.S3_REGION ?? 'auto',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
  /** Optional: required only if "enhanced push security" is turned on for the Expo project. */
  expoAccessToken: process.env.EXPO_ACCESS_TOKEN || undefined,
  mail: {
    provider: (process.env.MAIL_PROVIDER ?? 'mailpit') as 'mailpit' | 'resend',
    mailpitUrl: process.env.MAILPIT_URL ?? 'http://localhost:8025',
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    from: process.env.MAIL_FROM ?? 'TableMates <onboarding@resend.dev>',
  },
};
