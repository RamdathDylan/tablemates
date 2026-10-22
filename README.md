# TableMates

Track every restaurant you visit, review it, and see recommendations from your friends, and only your friends.

## What's here

| Path | What |
|---|---|
| `apps/mobile` | Expo app (iOS, Android, web) built with Expo Router and TanStack Query |
| `apps/api` | Node API: Fastify, Drizzle ORM, Postgres |
| `packages/ui` | Design system: tokens and components ([docs](packages/ui/README.md)) |
| `packages/shared` | Zod schemas and response types shared by the API and the app |

## Setup

Requires Node 22+, Docker, and pnpm. If pnpm isn't installed, prefix the commands below with `corepack` (for example `corepack pnpm install`).

```sh
pnpm install
cp .env.example apps/api/.env        # then set JWT_SECRET and GOOGLE_PLACES_API_KEY
pnpm db:up                           # Postgres on localhost:5433 (plus a test DB) and Mailpit
pnpm db:migrate
pnpm dev:api                         # http://localhost:4000
pnpm dev:mobile                      # press w for web, i for the iOS simulator
```

**Google Places:** restaurant search needs a key with the **Places API (New)** enabled. Without one, search returns 503 and everything else still works. The key stays on the server; the app calls `/places/search` on the API.

**Email:** sign-up sends a 6-digit verification code. In development it goes to Mailpit, a local inbox at http://localhost:8025, so no real mail is sent. For real delivery, set `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `MAIL_FROM`. Until you verify a domain in Resend, it only delivers to your own address.

**Photos:** `pnpm db:up` also starts RustFS, an S3-compatible store, at http://localhost:9000 (console on :9001). The API creates the bucket and its browser-upload CORS rule on startup.
- For **Cloudflare R2** in production:
  - Create a bucket and an R2 API token with read and write access.
  - Set `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`.
  - Set `PUBLIC_API_URL` to the API's public address (it's used for avatar links).
  - If the token can't edit bucket settings, add a CORS rule in the R2 dashboard allowing `PUT` and `GET` from your app's origin.
- The bucket stays private. Review photos are served through short-lived signed URLs only to people allowed to see the review.

**Push notifications:** run `npx eas-cli@latest init` in `apps/mobile` to create an EAS project, which adds `extra.eas.projectId` to the app config. Then make a development build (`npx expo run:ios` or `eas build --profile development`). Expo Go on Android can't receive push. The API's worker sends through Expo's push service, and the inbox works without any of this.

**Phones:** on a real device the app talks to the API at your machine's LAN address (taken from the Expo dev server). To point it somewhere else, set `EXPO_PUBLIC_API_URL`.

## Checks

```sh
pnpm typecheck   # all packages
pnpm test        # API integration tests (needs `pnpm db:up`) and the design-token contrast check
```

## How friends-only works

All reads of visits and reviews filter authors through `apps/api/src/lib/visibility.ts`:
- **Feed:** your friends' reviews.
- **Restaurant page:** your reviews and your friends' reviews.
- **Profile visits:** you or your friends only.

Each visit also has an audience: **Friends** (the default), **Close friends** (only people you've starred), or **Only me**. The shared filters `friendVisitFilter`, `visibleVisitFilter`, and `visitsOfFilter` apply both rules, and `apps/api/test/privacy.test.ts` checks each audience everywhere a review can appear.

A pending request grants nothing, and unfriending hides reviews again right away (and clears close-friend status). `apps/api/test/visibility.test.ts` covers these cases.

## Auth
- New accounts must enter the emailed code before using the app. Until then the API returns 403 `email_unverified` for everything except `/me` and the verify and resend endpoints.
- Codes are stored as HMACs, expire after 15 minutes, lock after 5 wrong tries, and can be resent once a minute.
- Sign-up, login, and verify are rate-limited per IP.
- Access tokens are 15-minute JWTs.
- Refresh tokens are rotated and stored hashed. Reusing an old refresh token revokes every session for that user.
- Native apps keep the refresh token in the Keychain or Keystore (`expo-secure-store`).
- Web gets it as an httpOnly cookie.
