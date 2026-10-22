# API reference

The TableMates API is a JSON REST API served by Fastify. In development it runs at `http://localhost:4000`.

Request bodies and query strings are validated with the Zod schemas in [`packages/shared/src/schemas.ts`](../packages/shared/src/schemas.ts). Response shapes are the TypeScript types in [`packages/shared/src/types.ts`](../packages/shared/src/types.ts). Those two files are the authoritative contract, and this page summarizes them.

## Contents

- [Conventions](#conventions)
- [Authentication](#authentication)
- [Errors](#errors)
- [Pagination](#pagination)
- [Endpoints](#endpoints)

---

## Conventions

| Topic | Convention |
|---|---|
| Format | JSON request and response bodies; `Content-Type: application/json` |
| IDs | UUIDs |
| Dates | Calendar dates as `YYYY-MM-DD`; timestamps as ISO 8601 in UTC |
| Status codes | `200` OK, `201` created (body `{ "id": … }`), `204` no content |
| Hidden resources | `404`, never `403`, when revealing existence would leak information |
| Visibility | Every response is already filtered for the caller (see the [privacy model](privacy.md)) |

## Authentication

```
Authorization: Bearer <access token>
```

| Step | Endpoint | Notes |
|---|---|---|
| Create an account | `POST /auth/signup` | Returns tokens. The account is unverified until the emailed code is confirmed. |
| Verify email | `POST /auth/verify-email` | `{ code }`. Locks after 5 wrong attempts. |
| Resend code | `POST /auth/resend-verification` | Allowed once a minute. |
| Log in | `POST /auth/login` | `{ email, password }` |
| Refresh | `POST /auth/refresh` | Rotates the refresh token. Native clients send `{ refreshToken }`; web uses the `tm_refresh` httpOnly cookie. |
| Log out | `POST /auth/logout` | Revokes the refresh token. |

- **Token lifetimes:** access tokens last 15 minutes, and refresh tokens last 30 days.
- **Unverified accounts:** until the email is verified, every endpoint except `GET /me`, `POST /auth/verify-email` and `POST /auth/resend-verification` returns `403 email_unverified`.
- **Rate limits:** sign-up, login and verification are rate-limited per IP. Over the limit, they return `429 rate_limited`.

## Errors

Every error uses one shape:

```json
{
  "error": "validation_error",
  "message": "Pick a restaurant",
  "issues": [{ "path": "restaurantId", "message": "Pick a restaurant" }]
}
```

| `error` | Status | Meaning |
|---|---|---|
| `validation_error` | 400 | The body or query failed schema validation. `issues` lists each problem. |
| `bad_request` | 400 | Valid shape, but not allowed (for example, inviting someone who isn't a friend) |
| `unauthorized` | 401 | Missing or expired access token |
| `email_unverified` | 403 | The account hasn't confirmed its email |
| `forbidden` | 403 | You can see the resource but can't change it |
| `not_found` | 404 | Doesn't exist, or isn't visible to you |
| `conflict` | 409 | Duplicate (for example, the username is taken) |
| `rate_limited` | 429 | Too many requests |
| `places_unavailable` | 503 | No Google Places key is configured |

## Pagination

Endpoints that return long, growing collections use cursor pagination:

```
GET /feed?limit=20&cursor=<opaque>
→ { "items": [...], "nextCursor": "<opaque>" | null }
```

To get the next page, pass `nextCursor` back as `cursor`. A `null` cursor means there are no more items.

## Endpoints

### Account and profile

| Method | Path | Description |
|---|---|---|
| GET | `/me` | The signed-in user |
| PATCH | `/me` | Update name, bio, home city, avatar (`avatarPhotoId`) or time zone |
| GET | `/me/visits` | Your visits |
| GET | `/me/tagged` | Visits friends tagged you on that you haven't logged yet |
| GET | `/me/saved` | Your want-to-try list |
| PUT | `/me/favorites` | Set your top 4 (`{ restaurantIds }`, in order) |
| GET | `/me/streak` | `{ current, best, thisWeekDone }` |
| PUT / DELETE | `/me/goals/:year` | Set (`{ target }`) or remove a yearly new-places goal |
| GET | `/me/wrapped?year=` | Year-in-review recap |
| GET / PATCH | `/me/notification-settings` | Per-type push mutes |
| POST / DELETE | `/me/push-tokens[/:token]` | Register or remove a device for push |
| GET | `/users/search?q=` | Find people |
| GET | `/users/:username` | Profile. Stats, favorites, streak, goal and mayor count are included for you and your friends only. |
| GET | `/users/:username/visits` | Their visits you can see (friends only) |
| GET | `/users/:username/lists` | Their shared lists (friends only) |
| GET | `/users/:username/badges` | Badges; your own include progress |
| GET | `/avatars/:id` | Public redirect to an avatar image (no auth) |

### Friends

| Method | Path | Description |
|---|---|---|
| GET | `/friends` | Your friends, with close-friend status and taste match |
| DELETE | `/friends/:userId` | Unfriend |
| GET | `/friends/requests` | Incoming and outgoing requests |
| POST | `/friends/requests` | Send a request (`{ username }`) |
| POST | `/friends/requests/:id/accept` / `decline` | Respond to or cancel a request |
| PUT / DELETE | `/me/close-friends/:userId` | Star or unstar a friend |

### Restaurants and places

| Method | Path | Description |
|---|---|---|
| GET | `/places/search?q=&lat=&lng=` | Restaurant search (proxied to Google Places) |
| GET | `/restaurants/:id` | Details, your and your friends' reviews, friend stats, top dishes, photos and mayor |
| GET | `/restaurants/:id/my-visits` | Your visit history here |
| PUT / DELETE | `/restaurants/:id/save` | Add or remove from want to try |

### Visits and reviews

| Method | Path | Description |
|---|---|---|
| POST | `/visits` | Log a visit (`googlePlaceId`, `visitedAt`, `audience`, `companionIds`, optional `review` with rating, body, dishes and `photoIds`) |
| PATCH / DELETE | `/visits/:id` | Edit or delete your visit |
| POST | `/visits/:id/review` | Add a review to an existing visit |
| DELETE | `/visits/:id/companions/me` | Remove yourself from a visit you were tagged on |
| PATCH / DELETE | `/reviews/:id` | Edit or delete your review |
| PUT / DELETE | `/reviews/:id/reactions/:kind` | React with `yum` or `going` |
| GET / POST | `/reviews/:id/comments` | Read or add comments |
| DELETE | `/comments/:id` | Delete your comment |

### Discovery

| Method | Path | Description |
|---|---|---|
| GET | `/feed` | Friends' reviews (paginated) |
| GET | `/map/places` | Map pins: `scope` (everyone, me, friends, friend + `friendId`), `recommended`, `minRating`, `cuisine`, `saved`, `listId`, `sort`, `lat` and `lng` |
| GET | `/for-you?lat=&lng=` | Taste-weighted recommendations |
| GET | `/blend?with=id,id` | Group picks with up to 5 friends |
| GET | `/memories?date=` | Your visits on this date in earlier years |

### Photos

| Method | Path | Description |
|---|---|---|
| POST | `/uploads` | Start an upload (`{ kind, contentType, bytes }`): returns a photo id and a presigned PUT URL. JPEG, PNG or WebP, up to 8 MB. |
| POST | `/photos/:id/confirm` | Confirm the upload after the PUT completes |

### Lists and crawls

| Method | Path | Description |
|---|---|---|
| GET | `/me/lists` | `{ mine, following, tables }` |
| POST | `/lists` | Create (`title`, `description`, `audience`, optional `tableId`, `kind`: list or crawl) |
| GET / PATCH / DELETE | `/lists/:id` | Read (crawls include `route` distances), edit or delete |
| PUT / DELETE | `/lists/:id/items/:restaurantId` | Add (with an optional `note`) or remove a place |
| PUT | `/lists/:id/order` | Reorder a crawl (`{ restaurantIds }`, every stop exactly once) |
| PUT / DELETE | `/lists/:id/follow` | Follow or unfollow |
| POST | `/lists/:id/save-all` | Save every place to want to try |

### Plans and asks

| Method | Path | Description |
|---|---|---|
| GET / POST | `/plans` | Your plans, or create one (`title`, `startsAt`, `memberIds`, optional `tableId`) |
| GET | `/plans/:id` | Plan with options and votes |
| POST | `/plans/:id/options` | Suggest a restaurant |
| DELETE | `/plans/:id/options/:optionId` | Remove a suggestion |
| PUT / DELETE | `/plans/:id/options/:optionId/vote` | Vote or unvote |
| POST | `/plans/:id/decide` | Lock in the winner (`{ optionId }`) |
| POST | `/plans/:id/leave` | Leave the plan |
| GET / POST | `/asks` | Open questions from friends, or ask one |
| DELETE | `/asks/:id` | Close your question |
| POST | `/asks/:id/replies` | Suggest a restaurant |
| DELETE | `/asks/:askId/replies/:id` | Remove your reply |

### Tables

| Method | Path | Description |
|---|---|---|
| GET / POST | `/tables` | Your tables, or create one (`name`, `emoji`, `memberIds`) |
| GET / PATCH / DELETE | `/tables/:id` | Details with members, lists and plans; rename or delete (owner only) |
| GET | `/tables/:id/feed` | Members' reviews you can see (paginated) |
| POST | `/tables/:id/members` | Add friends (owner only) |
| DELETE | `/tables/:id/members/:userId` | Remove a member (owner) or leave (yourself) |

### Stories, plate check and Out now

| Method | Path | Description |
|---|---|---|
| GET / POST | `/stories` | Friends' active stories grouped by author, or post one |
| DELETE | `/stories/:id` | Delete your story |
| POST | `/stories/:id/view` | Mark as viewed (idempotent) |
| POST | `/stories/:id/react` | React with an emoji |
| GET | `/stories/:id/viewers` | Who viewed it (author only) |
| GET | `/plates/today` | Today's prompt, your plate, and friends' plates once you've posted |
| POST | `/plates` | Post your plate |
| GET / POST | `/checkins` | Your live check-in plus friends', or check in (`restaurantId` or `googlePlaceId`, `audience`, `hours`, `notifyCloseFriends`) |
| DELETE | `/checkins/me` | End your check-in |

### Challenges

| Method | Path | Description |
|---|---|---|
| GET / POST | `/challenges` | Yours, or create one (`title`, `metric`, `target`, `startsOn`, `endsOn`, `memberIds`) |
| GET | `/challenges/:id` | Details, leaderboard and pending invites |
| POST | `/challenges/:id/join` / `leave` | Join, or leave and decline |
| POST | `/challenges/:id/members` | Invite more friends (creator only) |

### Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | Activity inbox (paginated) |
| GET | `/notifications/summary` | Unread counts for badges |
| POST | `/notifications/read` | Mark specific alerts read (`{ ids }`) |
| POST | `/notifications/read-all` | Mark everything read |

### Operations

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness check (no auth) |
