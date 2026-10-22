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
pnpm db:up                           # Postgres on localhost:5433, plus a test database
pnpm db:migrate
pnpm dev:api                         # http://localhost:4000
pnpm dev:mobile                      # press w for web, i for the iOS simulator
```

**Google Places:** restaurant search needs a key with the **Places API (New)** enabled. Without one, search returns 503 and everything else still works. The key stays on the server; the app calls `/places/search` on the API.

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

A pending request grants nothing, and unfriending hides reviews again right away. `apps/api/test/visibility.test.ts` covers these cases.

## Auth

- Access tokens are 15-minute JWTs.
- Refresh tokens are rotated and stored hashed. Reusing an old refresh token revokes every session for that user.
- Native apps keep the refresh token in the Keychain or Keystore (`expo-secure-store`).
- Web gets it as an httpOnly cookie.
