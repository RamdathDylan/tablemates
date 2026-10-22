# Features

This guide describes what TableMates does, grouped by what people use it for. Each section names the screens where the feature appears and the API that backs it. Who can see each piece of data is covered in the [privacy model](privacy.md).

## Contents

- [Accounts and friends](#accounts-and-friends)
- [Logging visits](#logging-visits)
- [Discovery](#discovery)
- [Planning together](#planning-together)
- [Groups and presence](#groups-and-presence)
- [Motivation](#motivation)
- [Notifications](#notifications)

---

## Accounts and friends

| Feature | Description |
|---|---|
| **Sign-up with email verification** | New accounts confirm a 6-digit code sent by email before they can use the app. A short onboarding step follows. |
| **Profiles** | Name, username, photo, home city and bio. Friends also see visit counts, your top 4 favorites, your streak, your yearly goal, badges, lists and the places where you're mayor. |
| **Friend requests** | Search by name or username, send a request, and accept or decline. The Friends tab shows a badge with the number of pending requests. |
| **Close friends** | Star friends to make a smaller audience for visits, stories and check-ins. Unfriending someone also clears the star. |
| **Taste match** | A 0–100% score for how closely your ratings agree with a friend's, shown once you've both rated at least 3 of the same places. |

**API:** `/auth/*`, `/me`, `/users/*`, `/friends/*`, `/me/close-friends/*`

## Logging visits

| Feature | Description |
|---|---|
| **Log a visit** | Pick a restaurant (search uses Google Places), a date and an audience. You can add a star rating, a recommendation, a written review, the dishes you ordered (each with its own rating) and up to 6 photos. |
| **Companions** | Tag the friends you ate with. They get an alert and can add their own rating to the same visit. |
| **Audiences** | Each visit is shared with **Friends**, **Close friends** or **Only me**. The app preselects whatever you used last. |
| **Visit history** | A restaurant page shows your own visits there, plus a chart of how your rating changed once you've rated it twice or more. |
| **Restaurant essentials** | Opening hours with "open now", phone, website, neighborhood and directions, fetched from Google Places and cached. |
| **Top dishes** | What you and your friends order most at each restaurant, ranked by orders and average rating. |
| **Photos** | Reviews carry photos, and restaurant pages collect your friends' photos. Uploaded images are resized and re-encoded on the device, which strips location data. |
| **Top 4 favorites** | Pin four places you've visited to the top of your profile. |

**API:** `/visits`, `/reviews/*`, `/restaurants/*`, `/places/search`, `/uploads`, `/photos/*`, `/me/favorites`

## Discovery

| Feature | Description |
|---|---|
| **Feed** | Your friends' reviews, newest first. You can react with **Yum** or **Going**, comment, and save the place. |
| **Friends map** | Every place you and your friends have visited, shown as pins. You can filter by everyone, just you, friends, or one friend; by recommended places, a minimum rating, a cuisine, places that are open now, your want-to-try list or one list. You can sort by most recommended, highest rated, most recent or nearest. A list view works on every device. |
| **For You** | Places friends rated 4 stars or higher that you haven't tried. Each friend's rating counts in proportion to how well your tastes match, and nearby places get a boost. |
| **Want to try** | A private list of places to visit. If a friend reviews a place you've saved, you get an alert. |
| **Mayors** | The person with the most visits to a place in the last 60 days, among you and your friends. It takes at least 2 visits. The mayor is shown on restaurant pages and the map, and places where you're mayor get a crown on your pin. |
| **Blend** | Choose up to 5 friends to see places the group is likely to enjoy: someone loved it, nobody disliked it, and not everyone has been. **Make it a plan** turns the top picks into a dinner plan. |
| **On this day** | A Feed card showing one of your visits from this date in an earlier year, or from one or six months ago. From the card you can **Go again** or invite the friends you went with. |

**API:** `/feed`, `/map/places`, `/for-you`, `/me/saved`, `/restaurants/:id/save`, `/blend`, `/memories`

## Planning together

| Feature | Description |
|---|---|
| **Dinner plans** | Invite friends, suggest restaurants, vote, and lock in the winner. Everyone is told the decision. |
| **Ask your friends** | Post a question ("Best ramen near Union Square?"), and friends answer with a restaurant and a note. |
| **Lists** | Curated, shareable collections of places, visible to friends or only you. Friends can follow a list or save every place on it in one tap. |
| **Food crawls** | Ordered lists of stops. Each crawl shows the distance between stops and in total, a Google Maps walking route through every stop, and numbered pins joined by a dashed line on the map. **Plan this crawl** creates a plan with every stop as an option. |

**API:** `/plans/*`, `/asks/*`, `/lists/*`, `/me/lists`

## Groups and presence

| Feature | Description |
|---|---|
| **Tables** | Small friend groups, each with a name and an emoji. A table has its own feed, collaborative lists that any member can edit, and plans that invite every member. The owner manages membership, and any member can leave. |
| **Tonight stories** | Photo posts that last 24 hours, optionally tagged with a restaurant and a caption. They can be shared with friends or close friends. Viewers can react with an emoji, and the author can see who viewed each story. |
| **Plate check** | Once a day, at a random time between 11:30 and 20:30 in each person's time zone, everyone is prompted to share what they're eating. Friends' plates stay hidden until you post your own, and posts made after the first 5 minutes are labeled late. |
| **Out now** | Tap **I'm here** to show friends where you are for 1, 3 or 6 hours. You can optionally alert your close friends. Check-ins appear on the Feed and the map, and end when you end them or when they expire. |

**API:** `/tables/*`, `/stories/*`, `/plates/*`, `/checkins`

## Motivation

| Feature | Description |
|---|---|
| **Streaks** | Consecutive weeks with at least one logged visit, counted in your time zone. A flame chip shows the streak, there's a celebration at 4, 10, 26 and 52 weeks, and a reminder arrives on Sunday evening if this week is still open. |
| **Yearly goal** | A target number of new places for the year, with a progress bar showing whether you're on pace, a "goal reached" alert, and a slide in your year in review. |
| **Badges** | A passport of achievements, such as Explorer (10 places), World Kitchen (25 cuisines), Trailblazer (first of your friends to review a place) and Champion (winning a challenge), with progress toward each. |
| **Challenges** | Race your friends to a target of new places, cuisines, visits or reviews within a set period. Templates such as "3 new cuisines this month" are provided. Each challenge has a leaderboard, alerts when someone hits the target, and a winner announced at the end. |
| **Year in review** | A recap of your year: visits, new places, busiest months and weekdays, favorite cuisines, regular spots, your dinner crew, best new find and your goal. |

**API:** `/me/streak`, `/me/goals/:year`, `/users/:username/badges`, `/challenges/*`, `/me/wrapped`

## Notifications

Every alert is written to an **activity inbox**, and also sent as a push notification on devices where push is enabled. Each type has its own mute toggle in settings. Muting stops push for that type, and the alert still appears in the inbox.

| Group | Alert types |
|---|---|
| Friends | `friend_request`, `friend_accepted`, `tagged`, `checkin` |
| Reviews | `reaction`, `comment`, `saved_place_reviewed`, `story_reaction` |
| Planning | `ask_reply`, `plan_invite`, `plan_decided`, `table_invite` |
| Engagement | `badge`, `plate_prompt`, `streak_nudge`, `goal_reached`, `mayor_lost`, `challenge_invite`, `challenge_complete`, `challenge_ended` |

**API:** `/notifications/*`, `/me/notification-settings`, `/me/push-tokens/*`
