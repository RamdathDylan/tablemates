import { z } from 'zod';

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
    homeCity: z.string().trim().max(80).nullable(),
  })
  .partial();
export type UpdateProfileInput = z.infer<typeof updateProfileInput>;

export const friendRequestInput = z.object({ username });

export const markNotificationsReadInput = z.object({ ids: z.array(z.uuid()).min(1).max(50) });

export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).default(''),
  recommends: z.boolean(),
  dishes: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
});
export type ReviewInput = z.input<typeof reviewInput>;

export const createVisitInput = z.object({
  googlePlaceId: z.string().min(1).max(300),
  visitedAt: z.iso.date(),
  review: reviewInput.optional(),
});
export type CreateVisitInput = z.input<typeof createVisitInput>;

export const updateReviewInput = reviewInput.partial();
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
  sort?: (typeof mapSorts)[number];
  lat?: number;
  lng?: number;
}

export const feedQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
