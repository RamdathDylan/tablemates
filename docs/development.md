# Development

This guide covers setting up TableMates locally, configuring it, and the everyday workflows: running the apps, changing the database and running the checks.

## Contents

- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Local services](#local-services)
- [Configuration](#configuration)
- [Running the apps](#running-the-apps)
- [Database changes](#database-changes)
- [Testing](#testing)
- [Conventions](#conventions)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 or newer | |
| pnpm | 10 | If it isn't installed, run every command through Corepack, which ships with Node: `corepack pnpm install`. |
| Docker | Recent Docker Desktop or Engine | Runs Postgres, the local email inbox and local photo storage |
| Xcode / Android Studio | Optional | Only for the iOS simulator, an Android emulator or development builds |

## First-time setup

```sh
pnpm install
cp .env.example apps/api/.env
```

Edit `apps/api/.env`:

- Set `JWT_SECRET` to a long random string, for example from `openssl rand -base64 48`.
- Optionally set `GOOGLE_PLACES_API_KEY` to enable restaurant search (see [Configuration](#configuration)).

Then start the services and create the schema:

```sh
pnpm db:up        # Postgres, Mailpit and RustFS
pnpm db:migrate   # applies apps/api/drizzle/*.sql
```

## Local services

`pnpm db:up` starts everything in [`docker-compose.yml`](../docker-compose.yml):

| Service | Address | Purpose |
|---|---|---|
| Postgres 16 | `localhost:5433` | The `tablemates` database, plus `tablemates_test` for the test suite (created on first start) |
| Mailpit | http://localhost:8025 | Catches outgoing email. Verification codes appear here. |
| RustFS | http://localhost:9000 (console on :9001) | S3-compatible photo storage. The API creates the bucket and its CORS rule on startup. |

Data persists in Docker volumes. To reset the database, run `docker compose down -v` and then `pnpm db:up && pnpm db:migrate`.

## Configuration

### API (`apps/api/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | | Postgres connection string |
| `TEST_DATABASE_URL` | For tests | | Separate database used by `pnpm test` |
| `JWT_SECRET` | Yes | | Signs access tokens and HMACs verification codes |
| `PORT` | | `4000` | HTTP port |
| `CORS_ORIGINS` | | `http://localhost:8081` | Comma-separated browser origins allowed to call the API (and to upload photos) |
| `PUBLIC_API_URL` | | `http://localhost:$PORT` | Public base URL, used for avatar links |
| `GOOGLE_PLACES_API_KEY` | | | Server-side key with **Places API (New)** enabled. Without it, search returns 503 and everything else still works. |
| `MAIL_PROVIDER` | | `mailpit` | `mailpit` or `resend` |
| `MAILPIT_URL` | | `http://localhost:8025` | Mailpit's HTTP API |
| `RESEND_API_KEY`, `MAIL_FROM` | With Resend | | Real email delivery |
| `S3_ENDPOINT` | | `http://localhost:9000` | Storage endpoint (RustFS locally, R2 in production) |
| `S3_PUBLIC_ENDPOINT` | | `S3_ENDPOINT` | Host used in signed URLs, when clients reach storage at a different address |
| `S3_BUCKET` | | `tablemates-photos` | Bucket name |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Yes, for photos | | Storage credentials (local defaults are in `.env.example`) |
| `S3_REGION` | | `auto` | Region (R2 uses `auto`) |
| `EXPO_ACCESS_TOKEN` | | | Needed only if "enhanced push security" is on for the Expo project |

### App (`apps/mobile/.env`)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_API_URL` | Overrides the API address. By default the app uses the Expo dev server's LAN address, so it works on real phones without any setup. |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Browser key for the Maps JavaScript API (the web map). Restrict it to your origins. Without it, the web map falls back to the list view. |
| `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID` | Map ID for advanced markers. Defaults to Google's demo ID in development. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Android Maps SDK key, used by native builds |

## Running the apps

```sh
pnpm dev:api      # API with reload on save at http://localhost:4000
pnpm dev:mobile   # Expo dev server: w = web, i = iOS simulator, a = Android emulator
```

- **Web:** http://localhost:8081.
- **Phones:** scan the QR code with Expo Go, or use a development build. The phone must be on the same network as your computer.
- **Push notifications** need a development build. Expo Go on Android can't receive them. The steps:
  1. Run `npx eas-cli@latest init` in `apps/mobile`, which adds `extra.eas.projectId` to the app config.
  2. Make a development build with `npx expo run:ios` or `eas build --profile development`.

  The activity inbox works without any of this.
- **Style guide:** in a development build, **Profile → Open style guide** shows every design token and component.

## Database changes

The schema is defined in TypeScript, in [`apps/api/src/db/schema.ts`](../apps/api/src/db/schema.ts).

```sh
# 1. Edit schema.ts
# 2. Generate a migration with a descriptive name
pnpm --filter @tablemates/api db:generate --name add_widgets
# 3. Review the SQL in apps/api/drizzle/, then apply it
pnpm db:migrate
```

- Commit the migration SQL together with the schema change.
- Never edit a migration that has already been merged. Add a new one instead.
- Add any new table to the `truncate` list in `apps/api/test/helpers.ts`, so tests start from a clean state.

## Testing

```sh
pnpm typecheck                             # every package
pnpm test                                  # API integration tests + design-token contrast check
pnpm --filter @tablemates/api exec vitest run test/tables.test.ts   # one file
pnpm --filter @tablemates/mobile exec expo lint                     # app lint
```

### API tests

- The tests are integration tests. Each one builds the real app with fake external services and sends HTTP requests through `app.inject`.
- They need `pnpm db:up`, because they run against the `tablemates_test` database, which is migrated automatically and truncated before each test.
- Helpers in [`apps/api/test/helpers.ts`](../apps/api/test/helpers.ts):

| Helper | Use |
|---|---|
| `setupTestApp()` | Builds the app, provides `ctx.app`, `ctx.db`, `ctx.places`, `ctx.mailer` and `ctx.storage`, and resets data before each test |
| `signup(app, name)` | A verified user |
| `signupUnverified(app, name)` | A user who hasn't confirmed their email |
| `as(app, user).get/post/put/patch/delete` | Authenticated requests |
| `befriend(app, a, b)` | Makes two users friends |
| `logVisit(app, user, placeId, review?)` | Logs a visit |
| `ctx.places.add(id, name, extra)` | Seeds a fake Google Places result |

- **Background jobs** are exported functions that take a `now` argument. Tests call them directly with fixed dates.
- **Privacy:** every feature that reads other people's data includes tests for a stranger, a friend outside the audience, and a private visit. See the [privacy model](privacy.md).

### Design system

`pnpm --filter @tablemates/ui test` checks every text and background color pair in both themes against WCAG AA.

## Conventions

- **Shared contract first.** Add request schemas to `packages/shared/src/schemas.ts` and response types to `types.ts`, then use them on both sides.
- **Privacy.** Read other people's visits only through `lib/visibility.ts`. Return 404 for anything hidden.
- **Notifications.** Create alerts only with `notify(tx, …)`, inside the transaction that caused them. A new notification type needs:
  - The enum values in the schema and in `shared`.
  - Push copy in `push/worker.ts`.
  - An Activity message and icon.
  - A settings label.
- **UI.**
  - Build from `@tablemates/ui` tokens and components. Don't add hex values or custom font sizes.
  - Give every pressable element an accessible label.
  - Never nest a pressable inside another pressable.
- **Query keys** live in `apps/mobile/src/lib/query-keys.ts`. Mutations invalidate the keys they affect.
- **Comments** explain *why*, not *what*.

## Troubleshooting

| Symptom | Fix |
|---|---|
| No verification email | Open Mailpit at http://localhost:8025. If it isn't running, run `pnpm db:up`. |
| Restaurant search returns 503 | `GOOGLE_PLACES_API_KEY` isn't set, or the key doesn't have **Places API (New)** enabled. |
| "Photo storage is not reachable" at startup | RustFS isn't running (`pnpm db:up`), or the `S3_*` credentials don't match `docker-compose.yml`. |
| Photo uploads fail in the browser | Add the app's origin to `CORS_ORIGINS` and restart the API, which updates the bucket's CORS rule. |
| `429 rate_limited` while testing sign-ups | Auth endpoints are limited per IP. Wait a minute between bursts of new accounts. |
| TypeScript says a new screen route doesn't exist | Expo regenerates typed routes while the dev server runs. Open the app once, then run the typecheck again. |
| The phone can't reach the API | Make sure the phone and computer are on the same network, or set `EXPO_PUBLIC_API_URL`. |
| Tests time out or deadlock | Another test run is using the test database. Let it finish, or stop it first. |
