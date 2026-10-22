import type { OpeningHours } from '@tablemates/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Millisecond precision so timestamps round-trip through JS Dates exactly (keyset cursors rely on it).
const timestamptz = (name: string) => timestamp(name, { withTimezone: true, precision: 3 });

/** Who can see a visit (and its review) besides its author. */
export const visitAudience = pgEnum('visit_audience', ['friends', 'close_friends', 'private']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url'),
  homeCity: text('home_city'),
  /** Null until the user enters the code emailed at sign-up. */
  emailVerifiedAt: timestamptz('email_verified_at'),
  /** Notification types the user turned off for push (they still appear in the inbox). */
  mutedPushTypes: text('muted_push_types').array().notNull().default(sql`'{}'::text[]`),
  /** The audience picked on the user's last logged visit, preselected next time. */
  defaultAudience: visitAudience('default_audience').notNull().default('friends'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

/** The current sign-up code for a user. Only an HMAC of the code is stored. */
export const emailVerificationCodes = pgTable('email_verification_codes', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamptz('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0),
  lastSentAt: timestamptz('last_sent_at').notNull().defaultNow(),
});

export const friendshipStatus = pgEnum('friendship_status', ['pending', 'accepted']);

/**
 * One row per pair of users. A declined or cancelled request deletes the row,
 * so either person can send a new request later.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    addresseeId: uuid('addressee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatus('status').notNull().default('pending'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    acceptedAt: timestamptz('accepted_at'),
  },
  (t) => [
    uniqueIndex('friendships_pair_idx').using(
      'btree',
      sql`least(${t.requesterId}, ${t.addresseeId})`,
      sql`greatest(${t.requesterId}, ${t.addresseeId})`,
    ),
    index('friendships_addressee_idx').on(t.addresseeId),
    check('friendships_not_self', sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
);

export const reactionKind = pgEnum('reaction_kind', ['yum', 'going']);

export const notificationType = pgEnum('notification_type', [
  'friend_accepted',
  'friend_request',
  'saved_place_reviewed',
  'reaction',
  'comment',
  'tagged',
  'ask_reply',
  'plan_invite',
  'plan_decided',
]);

/**
 * The activity inbox. Write rows only through notify() in lib/notify.ts.
 * The Friends badge still counts pending friendships directly so it can't drift.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationType('type').notNull(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Unfriending deletes the friendship, which clears its alerts too.
    friendshipId: uuid('friendship_id').references(() => friendships.id, { onDelete: 'cascade' }),
    // What the alert is about, when it's about a review or place.
    reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    commentId: uuid('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    visitId: uuid('visit_id').references(() => visits.id, { onDelete: 'cascade' }),
    askId: uuid('ask_id').references(() => asks.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => plans.id, { onDelete: 'cascade' }),
    reaction: reactionKind('reaction'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    readAt: timestamptz('read_at'),
    /** Set by the push worker once delivery was attempted (outbox pattern). */
    pushedAt: timestamptz('pushed_at'),
  },
  (t) => [
    index('notifications_user_unread_idx').on(t.userId, t.readAt),
    index('notifications_unpushed_idx').on(t.createdAt).where(sql`${t.pushedAt} is null`),
  ],
);

/** Expo push tokens, one row per device. A token moves to whoever signed in last. */
export const pushTokens = pgTable(
  'push_tokens',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

export const restaurants = pgTable('restaurants', {
  id: uuid('id').primaryKey().defaultRandom(),
  googlePlaceId: text('google_place_id').notNull().unique(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  priceLevel: smallint('price_level'),
  cuisine: text('cuisine').array().notNull().default(sql`'{}'::text[]`),
  // Essentials from Places details; null until the restaurant page first loads them.
  openingHours: jsonb('opening_hours').$type<OpeningHours>(),
  utcOffsetMinutes: integer('utc_offset_minutes'),
  phone: text('phone'),
  website: text('website'),
  mapsUrl: text('maps_url'),
  neighborhood: text('neighborhood'),
  detailsFetchedAt: timestamptz('details_fetched_at'),
  cachedAt: timestamptz('cached_at').notNull().defaultNow(),
});

export const visits = pgTable(
  'visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    visitedAt: date('visited_at', { mode: 'string' }).notNull(),
    audience: visitAudience('audience').notNull().default('friends'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('visits_user_idx').on(t.userId, t.visitedAt),
    index('visits_restaurant_idx').on(t.restaurantId),
  ],
);

export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitId: uuid('visit_id')
      .notNull()
      .unique()
      .references(() => visits.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body').notNull().default(''),
    recommends: boolean('recommends').notNull(),
    dishes: text('dishes').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('reviews_created_idx').on(t.createdAt, t.id),
    check('reviews_rating_range', sql`${t.rating} between 1 and 5`),
  ],
);

/** Quick responses to a review: "Yum" (looks great) and "Going" (adding it to my plans). */
export const reactions = pgTable(
  'reactions',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: reactionKind('kind').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId, t.kind] })],
);

export const comments = pgTable(
  'comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('comments_review_idx').on(t.reviewId, t.createdAt)],
);

/**
 * Friends tagged on a visit ("with Maya and Bob"). A tagged friend can always
 * see that visit, and can log their own linked visit from it.
 */
export const visitCompanions = pgTable(
  'visit_companions',
  {
    visitId: uuid('visit_id')
      .notNull()
      .references(() => visits.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The tagged friend's own visit, once they add their rating. */
    linkedVisitId: uuid('linked_visit_id').references(() => visits.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.visitId, t.userId] }), index('visit_companions_user_idx').on(t.userId)],
);

export const planStatus = pgEnum('plan_status', ['open', 'decided']);

/** A group dinner: friends suggest places, vote, and the creator picks the winner. */
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  startsAt: timestamptz('starts_at'),
  status: planStatus('status').notNull().default('open'),
  decidedOptionId: uuid('decided_option_id'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
});

/** Everyone in a plan, including its creator. */
export const planMembers = pgTable(
  'plan_members',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.planId, t.userId] }), index('plan_members_user_idx').on(t.userId)],
);

export const planOptions = pgTable(
  'plan_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    addedBy: uuid('added_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('plan_options_once_idx').on(t.planId, t.restaurantId)],
);

/** One vote per member per option; members can vote for several options. */
export const planVotes = pgTable(
  'plan_votes',
  {
    optionId: uuid('option_id')
      .notNull()
      .references(() => planOptions.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.userId] })],
);

/** "Best ramen near Union Square?": a question to your friends, open for a week by default. */
export const asks = pgTable(
  'asks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    question: text('question').notNull(),
    areaLabel: text('area_label'),
    closesAt: timestamptz('closes_at').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('asks_author_idx').on(t.authorId, t.createdAt)],
);

/** A friend's suggested restaurant for an ask. */
export const askReplies = pgTable(
  'ask_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    askId: uuid('ask_id')
      .notNull()
      .references(() => asks.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    note: text('note').notNull().default(''),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ask_replies_once_idx').on(t.askId, t.authorId, t.restaurantId)],
);

/** People a user shares close-friends-only visits with. Always a subset of their friends. */
export const closeFriends = pgTable(
  'close_friends',
  {
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: uuid('friend_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerId, t.friendId] })],
);

/** A user's private "want to try" list. */
export const savedPlaces = pgTable(
  'saved_places',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    restaurantId: uuid('restaurant_id')
      .notNull()
      .references(() => restaurants.id, { onDelete: 'cascade' }),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.restaurantId] })],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamptz('expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [index('refresh_tokens_user_idx').on(t.userId)],
);
