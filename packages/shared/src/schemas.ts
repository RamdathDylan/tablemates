import { z } from 'zod';

/** A valid IANA time zone name ("America/New_York"). */
const timezone = z.string().max(64).refine((tz) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'Use 3–20 letters, numbers, or underscores');

export const signupInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  username,
  displayName: z.string().trim().min(1).max(50),
});
export type SignupInput = z.infer<typeof signupInput>;

export const loginInput = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInput>;

export const verifyEmailInput = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
});

export const refreshInput = z.object({
  // Native clients send the token in the body; web sends it as an httpOnly cookie.
  refreshToken: z.string().optional(),
});

export const updateProfileInput = z
  .object({
    displayName: z.string().trim().min(1).max(50),
    bio: z.string().trim().max(280),
    avatarUrl: z.url().nullable(),
    /** An uploaded avatar photo; replaces avatarUrl. */
    avatarPhotoId: z.uuid().nullable(),
    homeCity: z.string().trim().max(80).nullable(),
    timezone,
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const friendRequestInput = z.object({ username });

export const notificationTypes = [
  'friend_request',
  'friend_accepted',
  'saved_place_reviewed',
  'reaction',
  'comment',
  'tagged',
  'ask_reply',
  'plan_invite',
  'plan_decided',
  'badge',
  'story_reaction',
  'plate_prompt',
  'table_invite',
  'checkin',
] as const;

export const tableInput = z.object({
  name: z.string().trim().min(1, 'Name your table').max(40),
  emoji: z.string().trim().min(1).max(8).default('🍽️'),
  memberIds: z.array(z.uuid()).min(1, 'Invite at least one friend').max(30),
});

export const tableMembersInput = z.object({ userIds: z.array(z.uuid()).min(1).max(30) });

export const plateInput = z.object({
  photoId: z.uuid(),
  restaurantId: z.uuid().optional(),
  googlePlaceId: z.string().min(1).max(300).optional(),
});

export const storyReactions = ['😋', '🔥', '😍', '👀', '🙌'] as const;

export const storyInput = z.object({
  photoId: z.uuid(),
  restaurantId: z.uuid().optional(),
  googlePlaceId: z.string().min(1).max(300).optional(),
  caption: z.string().trim().max(140).default(''),
  audience: z.enum(['friends', 'close_friends']).default('friends'),
});

export const checkinInput = z
  .object({
    restaurantId: z.uuid().optional(),
    googlePlaceId: z.string().min(1).max(300).optional(),
    audience: z.enum(['friends', 'close_friends']).default('friends'),
    /** How long it stays up: 1 to 6 hours. */
    hours: z.number().int().min(1).max(6).default(3),
    /** Push close friends "Maya is at Joe's". Off unless asked. */
    notifyCloseFriends: z.boolean().default(false),
  })
  .refine((c) => c.restaurantId || c.googlePlaceId, { message: 'Pick a restaurant', path: ['restaurantId'] });

export const storyReactionInput = z.object({ emoji: z.enum(storyReactions) });

export const createPlanInput = z
  .object({
    title: z.string().trim().min(1, 'Name the plan').max(80),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    memberIds: z.array(z.uuid()).max(20).default([]),
    /** A Table plan includes every member of the table. */
    tableId: z.uuid().optional(),
  })
  .refine((p) => p.tableId || p.memberIds.length > 0, { message: 'Invite at least one friend', path: ['memberIds'] });

export const planOptionInput = z
  .object({ restaurantId: z.uuid().optional(), googlePlaceId: z.string().min(1).max(300).optional() })
  .refine((o) => o.restaurantId || o.googlePlaceId, { message: 'Pick a restaurant' });

export const decidePlanInput = z.object({ optionId: z.uuid() });

export const askInput = z.object({
  question: z.string().trim().min(5, 'Ask a little more').max(200),
  areaLabel: z.string().trim().max(60).optional(),
  /** How long friends can reply, in days. */
  days: z.number().int().min(1).max(30).default(7),
});

export const askReplyInput = z
  .object({
    restaurantId: z.uuid().optional(),
    googlePlaceId: z.string().min(1).max(300).optional(),
    note: z.string().trim().max(200).default(''),
  })
  .refine((r) => r.restaurantId || r.googlePlaceId, { message: 'Pick a restaurant' });

export const reactionKinds = ['yum', 'going'] as const;

export const commentInput = z.object({ body: z.string().trim().min(1, 'Write something first').max(500) });

export const registerPushTokenInput = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[.+\]$/, 'Not an Expo push token').max(300),
  platform: z.enum(['ios', 'android']),
});

export const notificationSettingsInput = z.object({
  /** Types that should not send a push (they still appear in Activity). */
  mutedPush: z.array(z.enum(notificationTypes)).max(notificationTypes.length),
});

export const markNotificationsReadInput = z.object({ ids: z.array(z.uuid()).min(1).max(50) });

/** A dish name, optionally with stars. Plain strings are accepted for older clients. */
export const dishInput = z.union([
  z.string().trim().min(1).max(60).transform((name) => ({ name, rating: null })),
  z.object({
    name: z.string().trim().min(1).max(60),
    rating: z.number().int().min(1).max(5).nullable().default(null),
  }),
]);

const dishesInput = z.array(dishInput).max(10);

export const MAX_REVIEW_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const photoContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const uploadInput = z.object({
  kind: z.enum(['review', 'avatar', 'story', 'plate']),
  contentType: z.enum(photoContentTypes),
  bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES, 'Photos must be 8 MB or smaller'),
});

export const confirmPhotoInput = z.object({
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
});

const photoIdsInput = z.array(z.uuid()).max(MAX_REVIEW_PHOTOS);

export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).default(''),
  recommends: z.boolean(),
  dishes: dishesInput.default([]),
  photoIds: photoIdsInput.default([]),
});
export type ReviewInput = z.input<typeof reviewInput>;

export const visitAudiences = ['friends', 'close_friends', 'private'] as const;
export type VisitAudience = (typeof visitAudiences)[number];

export const createVisitInput = z.object({
  googlePlaceId: z.string().min(1).max(300),
  visitedAt: z.iso.date(),
  /** Defaults to the user's last choice. */
  audience: z.enum(visitAudiences).optional(),
  /** Friends who came along. */
  companionIds: z.array(z.uuid()).max(10).default([]),
  /** Logging your own visit from one you were tagged on links the two. */
  fromVisitId: z.uuid().optional(),
  review: reviewInput.optional(),
});

export const updateVisitInput = z.object({ audience: z.enum(visitAudiences) });
export type CreateVisitInput = z.input<typeof createVisitInput>;

// Spelled out (no defaults) so a partial update never wipes fields it didn't mention.
export const updateReviewInput = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  body: z.string().trim().max(2000).optional(),
  recommends: z.boolean().optional(),
  dishes: dishesInput.optional(),
  photoIds: photoIdsInput.optional(),
});
export type UpdateReviewInput = z.input<typeof updateReviewInput>;

export const placesSearchQuery = z.object({
  q: z.string().trim().min(1).max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const userSearchQuery = z.object({ q: z.string().trim().min(1).max(50) });

const queryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

export const mapScopes = ['everyone', 'me', 'friends', 'friend'] as const;
export const mapSorts = ['recommended', 'rating', 'recent', 'distance'] as const;

export const mapPlacesQuery = z
  .object({
    scope: z.enum(mapScopes).default('everyone'),
    /** Required when scope is "friend". */
    friendId: z.uuid().optional(),
    recommended: queryBoolean.optional(),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
    cuisine: z.string().trim().min(1).max(40).optional(),
    /** Only places on the viewer's want-to-try list. */
    saved: queryBoolean.optional(),
    /** Only places on this list (one the viewer may see). */
    listId: z.uuid().optional(),
    sort: z.enum(mapSorts).default('recommended'),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine((q) => q.scope !== 'friend' || q.friendId, { message: 'Choose a friend', path: ['friendId'] })
  .refine((q) => q.sort !== 'distance' || (q.lat !== undefined && q.lng !== undefined), {
    message: 'Sorting by distance needs your location',
    path: ['sort'],
  });
/** Client-side shape of the query (values are serialized into the URL). */
export interface MapPlacesQuery {
  scope?: (typeof mapScopes)[number];
  friendId?: string;
  recommended?: boolean;
  minRating?: number;
  cuisine?: string;
  saved?: boolean;
  listId?: string;
  sort?: (typeof mapSorts)[number];
  lat?: number;
  lng?: number;
}

export const listInput = z.object({
  title: z.string().trim().min(1, 'Name the list').max(60),
  description: z.string().trim().max(280).default(''),
  audience: z.enum(['friends', 'private']).default('friends'),
  /** Makes it a Table's shared list. */
  tableId: z.uuid().optional(),
});

export const updateListInput = z.object({
  title: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(280).optional(),
  audience: z.enum(['friends', 'private']).optional(),
});

export const listItemInput = z.object({ note: z.string().trim().max(200).default('') });

export const forYouQuery = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const wrappedQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });

export const favoritesInput = z.object({
  restaurantIds: z
    .array(z.uuid())
    .max(4, 'Pick up to four favorites')
    .refine((ids) => new Set(ids).size === ids.length, 'Each place can only be pinned once'),
});

export const feedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
