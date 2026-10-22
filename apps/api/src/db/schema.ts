import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
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

export const notificationType = pgEnum('notification_type', [
  'friend_accepted',
  'friend_request',
  'saved_place_reviewed',
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
