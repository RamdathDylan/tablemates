# Deployment

This guide describes what a production TableMates deployment needs, and how to configure each part. The API is a single stateless Node.js process. The app is distributed through the App Store and Google Play (built with EAS) and as a static web build.

## Components

| Component | Recommended | Notes |
|---|---|---|
| API | Any Node.js 22 host or container platform | Serves HTTP and runs the background jobs in the same process |
| Database | Managed PostgreSQL 16 | Run migrations on every release |
| Photo storage | Cloudflare R2 (any S3-compatible service works) | Private bucket |
| Email | Resend | Requires a verified sending domain |
| Restaurant data | Google Places API (New) | Server-side key |
| Push | Expo Push service | Requires an EAS project |
| Web app | Any static host or CDN | Output of `npx expo export --platform web` |
| Native apps | EAS Build and Submit | |

## API

```sh
pnpm install --frozen-lockfile
pnpm db:migrate                       # with production DATABASE_URL
NODE_ENV=production pnpm --filter @tablemates/api start
```

Required settings for production:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (marks the refresh-token cookie `Secure`) |
| `DATABASE_URL` | The production database |
| `JWT_SECRET` | A long random secret, stored in your platform's secret manager |
| `PUBLIC_API_URL` | The API's public HTTPS address, for example `https://api.example.com` |
| `CORS_ORIGINS` | The web app's origin(s), for example `https://app.example.com` |
| `GOOGLE_PLACES_API_KEY` | A server key restricted to the Places API |
| `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, `MAIL_FROM` | `MAIL_FROM` must be on a verified domain |
| `S3_*` | See [Photo storage](#photo-storage) |
| `EXPO_ACCESS_TOKEN` | Only if "enhanced push security" is enabled in Expo |

**Health check:** `GET /health` returns 200 and needs no authentication.

**Scaling:**
- Each instance runs the job runner. Every job claims its work with conditional updates, so running several instances doesn't send duplicate notifications.
- Rate limits are counted in memory, per instance.
- **Known gap:** the API doesn't yet trust `X-Forwarded-For`. Behind a load balancer or reverse proxy, every client would share the proxy's IP and therefore one auth rate limit. Enable Fastify's `trustProxy` option in `buildApp` for your proxy before going live.

## Photo storage

For Cloudflare R2:

1. Create a bucket and leave it private.
2. Create an R2 API token with object read and write access to that bucket.
3. Configure:

```sh
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=tablemates-photos
S3_ACCESS_KEY_ID=<token access key>
S3_SECRET_ACCESS_KEY=<token secret>
S3_REGION=auto
```

At startup the API makes sure the bucket has a CORS rule allowing `PUT` and `GET` from `CORS_ORIGINS`. If the token isn't allowed to change bucket settings, add that rule in the R2 dashboard yourself.

Clients load photos through signed URLs that expire after an hour. No public bucket access is needed.

## Email

1. Add and verify your sending domain in Resend.
2. Set `MAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM` (for example `TableMates <hello@example.com>`).

Until the domain is verified, Resend delivers only to the account owner's address.

## Native apps and push

1. In `apps/mobile`, run `npx eas-cli@latest init` to create the EAS project.
2. Set production values for the app's environment: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` and `GOOGLE_MAPS_ANDROID_API_KEY`.
3. Set up push credentials (APNs for iOS, FCM for Android) with `eas credentials`.
4. Build and submit with `eas build --platform all` and `eas submit`.

The API sends pushes through Expo's service, using the device tokens the app registers.

## Web app

```sh
cd apps/mobile
EXPO_PUBLIC_API_URL=https://api.example.com npx expo export --platform web
```

Deploy the `dist/` directory to a static host, with every path rewritten to `index.html`. The host's origin must be listed in the API's `CORS_ORIGINS`.

## Release checklist

- [ ] `pnpm typecheck` and `pnpm test` pass on the release commit
- [ ] Database migrations reviewed and applied before the new API version takes traffic
- [ ] Secrets are set in the platform, not committed
- [ ] `CORS_ORIGINS` and `PUBLIC_API_URL` match the production domains
- [ ] Behind a proxy, `trustProxy` is configured so rate limits apply per client
- [ ] The `/health` check passes after deploy
- [ ] On a real device: sign-up email, restaurant search, a photo upload and a push notification all work
