# Privacy model

TableMates promises that **you see recommendations only from people you've added as friends**, and that each person decides who sees each of their visits. This guide states the rules precisely, shows where they're enforced and lists the tests that check them.

## Principles

1. **Friends only.** Another person's activity is visible only to their accepted friends. A pending request grants nothing.
2. **Per-visit audiences.** Each visit is shared with **Friends** (the default), **Close friends** (people the author has starred) or **Only me**.
3. **Enforced on the server.** Every rule is applied in SQL by the API. The app never receives data and then filters it.
4. **Aggregates obey the same rules.** Counts, rankings and recommendations are built only from what the asking user may see, so they can't reveal a private visit indirectly.
5. **Hidden means invisible.** For something you can't see, the API answers 404 and doesn't confirm that it exists.
6. **Revocation is immediate.** Unfriending someone hides everything right away and clears close-friend status. Leaving a group removes access to its lists at once.

## Where the rules live

[`apps/api/src/lib/visibility.ts`](../apps/api/src/lib/visibility.ts) is the only place that decides who can see whose visits. Every query that reads visits or reviews composes one of these helpers:

| Helper | Returns |
|---|---|
| `friendIdsOf(viewer)` | Subquery of the viewer's accepted friends |
| `audienceAdmits(viewer)` | Visits whose audience includes the viewer: Friends; Close friends when the author starred the viewer; or any visit the viewer was tagged on |
| `friendVisitFilter(viewer)` | Friends' visits the viewer may see (used by the feed) |
| `visibleVisitFilter(viewer)` | The viewer's own visits plus `friendVisitFilter` (used by restaurant pages, the map, mayors, Blend, table feeds) |
| `visitsOfFilter(owner, viewer)` | One person's visits as the viewer may see them (used by profiles, streaks, goals) |
| `relationshipsWith`, `canSeeActivityOf` | The friendship status between users, used for checks on profiles and invitations |

## Rules by feature

| Feature | Who can see it | Notes |
|---|---|---|
| Feed | Friends whose audience includes you | Your own reviews appear on your profile, not in your feed. |
| Restaurant pages, map, top dishes | You, and friends whose audience includes you | Friends' photos come only from reviews you can see. |
| Profiles | Basic profile for everyone; visits, stats, lists, favorites, streak, goal and badges for you and friends only | Stats count only the visits the viewer could open. |
| Photos | Exactly the people who can see the parent review, story or plate | The bucket is private; URLs are signed and expire after an hour. Avatars are public. |
| Stories | Friends, or close friends, for 24 hours | Only the author can see who viewed. |
| Plate check | Friends | Friends' plates stay hidden until you post your own. |
| Out now | Friends, or close friends, until it ends or expires | Opt-in only and never inferred from location. Push alerts go only to close friends, and only when the author asks. |
| Lists | The owner; friends for "Friends" lists | Table lists are visible only to current members of that table. |
| Plans, challenges | Invited members only | Only the creator's friends can be invited. |
| Tables | Members only | Only the owner's friends can be seated. Members who aren't friends with each other still can't see each other's friends-only reviews in the table feed. |
| Taste match, For You, Blend | Built from ratings the viewer can see | A private review never shapes a score or a pick. Blend works only with friends. |
| Streaks, goals | You and friends | A friend's view counts only the visits that friend can see. |
| Mayors | Relative to the viewer's circle (you and your friends) | Strangers' visits never count. "You lost a crown" is judged from the dethroned friend's view, so a visit they can't see can never take their crown. |
| Challenges | Members | Only visits that aren't private count toward a leaderboard. |
| On this day | Only you | Includes your private visits, because only you see them. Never pushed. |
| Activity inbox | Only you | Every alert is created by `notify()`, inside the transaction that caused it. |

## Accounts and sessions

- **Email verification.** New accounts confirm a 6-digit code before they can use the app. Codes are stored as HMACs, expire after 15 minutes, lock after 5 wrong attempts and can be resent once a minute.
- **Passwords** are hashed with Argon2.
- **Access tokens** are JWTs that expire after 15 minutes.
- **Refresh tokens** are rotated on every use and stored hashed. Reusing an old one revokes every session for that account.
  - Native apps keep the refresh token in the Keychain or Keystore.
  - On web it's an httpOnly cookie, out of reach of JavaScript.
- **Rate limits.** Sign-up, login and verification are rate-limited per IP.

## Data handling

- **Location.** The app uses your location only when you ask (to sort by distance or center the map), and sends it with that request only. It's never stored.
- **Photo metadata.** Before upload, the app resizes and re-encodes every photo, which removes embedded location (EXIF) data.
- **Third parties.** The Google Places key stays on the server, and restaurant searches are proxied through the API.

## How it's tested

Privacy is tested as a feature in its own right. Each test builds a small world (a viewer, a friend, a close friend, a stranger, and someone who isn't friends with one of the others) and checks every place where a piece of data could appear.

| Area | Test file |
|---|---|
| Friendship and revocation | `visibility.test.ts`, `friends.test.ts` |
| Visit audiences everywhere a review appears | `privacy.test.ts` |
| Photos and signed URLs | `photos.test.ts` |
| Stories, plate check, Out now | `stories.test.ts`, `plates.test.ts`, `checkins.test.ts` |
| Lists, plans, Tables | `lists.test.ts`, `plans.test.ts`, `tables.test.ts` |
| Aggregates | `taste.test.ts`, `blend.test.ts`, `streaks.test.ts`, `goals.test.ts`, `mayors.test.ts`, `challenges.test.ts` |
| Notifications | `notifications.test.ts`, `push.test.ts` |

When a feature adds a visibility rule, its tests include a **mutation check**: removing the filter from the query must make a test fail. This proves the test actually guards the rule.

## Adding a feature

Any new read of another person's data should:

1. Compose a helper from `lib/visibility.ts`. Don't hand-write friendship or audience SQL.
2. Return 404 for resources the viewer can't see.
3. Count or rank only visits the viewer may see, or visits that aren't private when results are shown to a group.
4. Create alerts only through `notify()`.
5. Come with tests for a stranger, a friend outside the audience, and a private visit.
