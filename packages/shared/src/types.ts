// Response shapes returned by the API. Dates are ISO strings on the wire.

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Me extends PublicUser {
  email: string;
  bio: string;
  homeCity: string | null;
  emailVerified: boolean;
  createdAt: string;
}

export type FriendshipStatus = 'none' | 'friends' | 'outgoing' | 'incoming' | 'self';

export interface Profile extends PublicUser {
  bio: string;
  homeCity: string | null;
  friendship: FriendshipStatus;
  /** Pending request id when friendship is 'incoming' or 'outgoing'. */
  requestId: string | null;
  /** Only present when the viewer is the user or a friend. */
  stats?: { visits: number; reviews: number; friends: number };
}

export interface UserSearchResult extends PublicUser {
  friendship: FriendshipStatus;
  requestId: string | null;
}

export interface AuthResponse {
  user: Me;
  accessToken: string;
  /** Omitted for web clients, which receive it as an httpOnly cookie. */
  refreshToken?: string;
}

export interface FriendRequest {
  id: string;
  user: PublicUser;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
}

export interface NotificationSummary {
  /** Incoming friend requests awaiting a response (drives the Friends badge). */
  pendingFriendRequests: number;
  /** People who accepted the viewer's friend requests since the alerts were last read. */
  unreadAccepted: { id: string; user: PublicUser; createdAt: string }[];
}

export interface Restaurant {
  id: string;
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  priceLevel: number | null;
  cuisine: string[];
}

export interface PlaceResult {
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  priceLevel: number | null;
  cuisine: string[];
}

export interface Review {
  id: string;
  visitId: string;
  rating: number;
  body: string;
  recommends: boolean;
  dishes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Visit {
  id: string;
  visitedAt: string;
  restaurant: Restaurant;
  review: Review | null;
}

export interface FeedItem {
  review: Review;
  visitedAt: string;
  author: PublicUser;
  restaurant: Restaurant;
  /** Whether the viewer has this restaurant on their want-to-try list. */
  saved: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface RestaurantDetail {
  restaurant: Restaurant;
  /** Reviews by the viewer and the viewer's friends only. */
  reviews: FeedItem[];
  friendStats: { visits: number; recommends: number; averageRating: number | null };
  saved: boolean;
}

export interface SavedPlace {
  restaurant: Restaurant;
  savedAt: string;
}

export interface MapVisitor {
  user: PublicUser;
  rating: number | null;
  recommends: boolean | null;
  visitedAt: string;
}

/** One restaurant on the map, summarizing the visits visible to the viewer. */
export interface MapPlace {
  restaurant: Restaurant;
  /** Totals across everyone included by the current scope. */
  summary: { visits: number; recommends: number; averageRating: number | null; lastVisitedAt: string };
  /** The viewer's own visits (null if they haven't been, or the scope excludes them). */
  me: { visits: number; rating: number | null; recommends: boolean | null; lastVisitedAt: string } | null;
  friends: {
    /** Distinct friends who've been. */
    count: number;
    visits: number;
    recommends: number;
    averageRating: number | null;
    /** Most recent visit per friend, newest first, up to 5. */
    visitors: MapVisitor[];
  };
  /** Most recent written review in scope, for previews. */
  latestReview: { author: PublicUser; rating: number; body: string; recommends: boolean; visitedAt: string } | null;
  /** Present when the request included a location. */
  distanceKm: number | null;
  /** On the viewer's want-to-try list. Saved places appear even before anyone visits. */
  saved: boolean;
}

export interface ApiError {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
