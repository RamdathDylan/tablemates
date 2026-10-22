import type * as T from '@tablemates/shared';

import type { restaurants, reviews, users } from '../db/schema';

type UserRow = typeof users.$inferSelect;
type RestaurantRow = typeof restaurants.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;

/** Columns safe to expose for any user. Never select password_hash for responses. */
export type PublicUserRow = Pick<UserRow, 'id' | 'username' | 'displayName' | 'avatarUrl'>;

export const toPublicUser = (u: PublicUserRow): T.PublicUser => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
});

export const toMe = (u: UserRow): T.Me => ({
  ...toPublicUser(u),
  email: u.email,
  bio: u.bio,
  homeCity: u.homeCity,
  emailVerified: u.emailVerifiedAt !== null,
  defaultAudience: u.defaultAudience,
  timezone: u.timezone,
  createdAt: u.createdAt.toISOString(),
});

export const toRestaurant = (r: RestaurantRow): T.Restaurant => ({
  id: r.id,
  googlePlaceId: r.googlePlaceId,
  name: r.name,
  address: r.address,
  lat: r.lat,
  lng: r.lng,
  priceLevel: r.priceLevel,
  cuisine: r.cuisine,
  hours: r.openingHours ?? null,
  utcOffsetMinutes: r.utcOffsetMinutes,
  phone: r.phone,
  website: r.website,
  mapsUrl: r.mapsUrl,
  neighborhood: r.neighborhood,
});

/** Dishes and photos live in their own tables; load them (dishesFor, photosFor) and pass them in. */
export const toReview = (r: ReviewRow, dishes: T.Dish[], photos: T.Photo[] = []): T.Review => ({
  id: r.id,
  visitId: r.visitId,
  rating: r.rating,
  body: r.body,
  recommends: r.recommends,
  dishes,
  photos,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});
