// Response shapes returned by the API. Dates are ISO strings on the wire.

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Me extends PublicUser {
  email: string;
  /** Preselected audience for the next visit (the last one used). */
  defaultAudience: 'friends' | 'close_friends' | 'private';
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

export interface Friend extends PublicUser {
  /** On the viewer's close-friends list. */
  closeFriend: boolean;
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
  /** Unread items in the activity inbox (drives the bell). */
  unread: number;
  /** People who accepted the viewer's friend requests since the alerts were last read. */
  unreadAccepted: { id: string; user: PublicUser; createdAt: string }[];
}

export type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'saved_place_reviewed'
  | 'reaction'
  | 'comment'
  | 'tagged'
  | 'ask_reply'
  | 'plan_invite'
  | 'plan_decided';

export type ReactionKind = 'yum' | 'going';

/** How friends have responded to a review. */
export interface Engagement {
  yum: number;
  going: number;
  /** The viewer's own reactions. */
  mine: ReactionKind[];
  comments: number;
}

export interface Comment {
  id: string;
  author: PublicUser;
  body: string;
  createdAt: string;
  /** The viewer may delete it (they wrote it, or it's on their review). */
  canDelete: boolean;
}

export interface NotificationSettings {
  mutedPush: NotificationType[];
}

/** One row in the activity inbox. */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  actor: PublicUser;
  createdAt: string;
  read: boolean;
  restaurant: { id: string; name: string } | null;
  reviewId: string | null;
  /** For friend_request: the request id while it's still pending (null once resolved). */
  pendingRequestId: string | null;
  /** For reaction notifications. */
  reaction: ReactionKind | null;
  /** For comment notifications: the start of the comment. For ask replies: the question. For plans: the title. */
  excerpt: string | null;
  planId: string | null;
}

/** Practical details from Google Places, fetched for restaurant pages. Null until fetched. */
export interface RestaurantEssentials {
  hours: import('./hours').OpeningHours | null;
  utcOffsetMinutes: number | null;
  phone: string | null;
  website: string | null;
  /** Google Maps page for the place (directions, reservations). */
  mapsUrl: string | null;
  neighborhood: string | null;
}

export interface Restaurant extends RestaurantEssentials {
  id: string;
  googlePlaceId: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  priceLevel: number | null;
  cuisine: string[];
}

export interface PlaceResult extends Partial<RestaurantEssentials> {
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
  audience: 'friends' | 'close_friends' | 'private';
  companions: PublicUser[];
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
  engagement: Engagement;
  /** Friends tagged on the visit. */
  companions: PublicUser[];
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

export interface AskReply {
  id: string;
  author: PublicUser;
  restaurant: Restaurant;
  note: string;
  /** The replier's own latest rating there, if the viewer may see that review. */
  rating: number | null;
  recommends: boolean | null;
  createdAt: string;
  /** On the viewer's want-to-try list. */
  saved: boolean;
}

export interface Ask {
  id: string;
  author: PublicUser;
  question: string;
  areaLabel: string | null;
  closesAt: string;
  createdAt: string;
  open: boolean;
  replies: AskReply[];
}

export interface PlanOption {
  id: string;
  restaurant: Restaurant;
  addedBy: PublicUser;
  voters: PublicUser[];
  /** The viewer voted for it. */
  voted: boolean;
  /** The viewer may remove it (added it, or created the plan). */
  canRemove: boolean;
}

export interface PlanSummary {
  id: string;
  title: string;
  startsAt: string | null;
  status: 'open' | 'decided';
  creator: PublicUser;
  members: PublicUser[];
  optionCount: number;
  /** The winning restaurant once decided. */
  decided: Restaurant | null;
}

export interface Plan extends PlanSummary {
  options: PlanOption[];
  isCreator: boolean;
}

/** A visit a friend tagged you on that you haven't logged yourself yet. */
export interface TaggedVisit {
  visitId: string;
  visitedAt: string;
  restaurant: Restaurant;
  by: PublicUser;
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
