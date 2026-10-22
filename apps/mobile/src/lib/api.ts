import type {
  ApiError as ApiErrorBody,
  Ask,
  Badge,
  Comment,
  AuthResponse,
  CreateVisitInput,
  FeedItem,
  ForYouItem,
  Friend,
  FriendRequest,
  FriendshipStatus,
  ListSummary,
  LoginInput,
  MapPlace,
  MapPlacesQuery,
  Me,
  NotificationItem,
  NotificationSettings,
  NotificationSummary,
  Page,
  PlaceResult,
  Plan,
  PlanSummary,
  ReactionKind,
  Profile,
  RestaurantDetail,
  RestaurantList,
  SavedPlace,
  TaggedVisit,
  Review,
  ReviewInput,
  SignupInput,
  UpdateProfileInput,
  UpdateReviewInput,
  UserSearchResult,
  Visit,
  VisitAudience,
  Wrapped,
} from '@tablemates/shared';

import { API_URL, isWeb } from './config';
import { refreshTokenStore } from './token-store';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }

  /** Field-level validation messages keyed by field name. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.body.issues ?? []).map((i) => [i.path, i.message]));
  }
}

// The access token lives only in memory; it is re-minted from the refresh token on launch.
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let refreshing: Promise<AuthResponse | null> | null = null;

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

async function send(method: string, path: string, body?: unknown) {
  return fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      'X-Tablemates-Client': isWeb ? 'web' : 'native',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Lets the browser send and receive the httpOnly refresh cookie.
    credentials: isWeb ? 'include' : 'omit',
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({ error: 'invalid_response', message: 'Unexpected server response' }));
  if (!res.ok) throw new ApiError(res.status, data as ApiErrorBody);
  return data as T;
}

async function startSession(auth: AuthResponse) {
  accessToken = auth.accessToken;
  await refreshTokenStore.set(auth.refreshToken);
  return auth;
}

/**
 * Exchanges the stored refresh token for a new session. Concurrent callers share
 * one request, because each refresh token can only be used once.
 */
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      const stored = await refreshTokenStore.get();
      if (!isWeb && !stored) return null;
      const res = await send('POST', '/auth/refresh', stored ? { refreshToken: stored } : {});
      if (!res.ok) {
        accessToken = null;
        await refreshTokenStore.clear();
        return null;
      }
      return startSession(await res.json());
    } catch {
      // Offline or server down: keep the stored token and try again next time.
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res = await send(method, path, body);
  // Access tokens are short-lived: on a 401, refresh once and retry.
  if (res.status === 401) {
    const session = await refreshSession();
    if (!session) {
      onSessionExpired?.();
      return parse<T>(res);
    }
    res = await send(method, path, body);
  }
  return parse<T>(res);
}

const qs = (params: Record<string, string | number | boolean | undefined>) => {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => [k, String(v)]);
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  async signup(input: SignupInput) {
    return startSession(await parse<AuthResponse>(await send('POST', '/auth/signup', input)));
  },
  async login(input: LoginInput) {
    return startSession(await parse<AuthResponse>(await send('POST', '/auth/login', input)));
  },
  async logout() {
    const stored = await refreshTokenStore.get();
    await send('POST', '/auth/logout', stored ? { refreshToken: stored } : {}).catch(() => {});
    accessToken = null;
    await refreshTokenStore.clear();
  },

  /** Verifying returns a new access token whose claim unlocks the rest of the API. */
  async verifyEmail(code: string) {
    const res = await request<{ user: Me; accessToken: string }>('POST', '/auth/verify-email', { code });
    accessToken = res.accessToken;
    return res.user;
  },
  resendVerification: () => request<void>('POST', '/auth/resend-verification'),

  me: () => request<Me>('GET', '/me'),
  updateMe: (input: UpdateProfileInput) => request<Me>('PATCH', '/me', input),
  profile: (username: string) => request<Profile>('GET', `/users/${encodeURIComponent(username)}`),
  userVisits: (username: string) =>
    request<Visit[]>('GET', `/users/${encodeURIComponent(username)}/visits`),
  searchUsers: (q: string) => request<UserSearchResult[]>('GET', `/users/search${qs({ q })}`),

  friends: () => request<Friend[]>('GET', '/friends'),
  addCloseFriend: (userId: string) => request<void>('PUT', `/me/close-friends/${userId}`),
  removeCloseFriend: (userId: string) => request<void>('DELETE', `/me/close-friends/${userId}`),
  friendRequests: () => request<FriendRequest[]>('GET', '/friends/requests'),
  sendFriendRequest: (username: string) =>
    request<{ status: FriendshipStatus; requestId: string }>('POST', '/friends/requests', { username }),
  acceptFriendRequest: (id: string) => request<{ status: 'friends' }>('POST', `/friends/requests/${id}/accept`),
  declineFriendRequest: (id: string) => request<void>('POST', `/friends/requests/${id}/decline`),
  removeFriend: (userId: string) => request<void>('DELETE', `/friends/${userId}`),

  notificationSummary: () => request<NotificationSummary>('GET', '/notifications/summary'),
  markNotificationsRead: (ids: string[]) => request<void>('POST', '/notifications/read', { ids }),
  notifications: (cursor?: string) => request<Page<NotificationItem>>('GET', `/notifications${qs({ cursor })}`),
  readAllNotifications: () => request<void>('POST', '/notifications/read-all'),
  registerPushToken: (token: string, platform: 'ios' | 'android') =>
    request<void>('POST', '/me/push-tokens', { token, platform }),
  unregisterPushToken: (token: string) => request<void>('DELETE', `/me/push-tokens/${encodeURIComponent(token)}`),
  notificationSettings: () => request<NotificationSettings>('GET', '/me/notification-settings'),
  updateNotificationSettings: (settings: NotificationSettings) =>
    request<NotificationSettings>('PATCH', '/me/notification-settings', settings),

  searchPlaces: (q: string, near?: { lat: number; lng: number } | null) =>
    request<PlaceResult[]>('GET', `/places/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),
  restaurant: (id: string) => request<RestaurantDetail>('GET', `/restaurants/${id}`),
  saved: () => request<SavedPlace[]>('GET', '/me/saved'),
  savePlace: (restaurantId: string) => request<void>('PUT', `/restaurants/${restaurantId}/save`),
  unsavePlace: (restaurantId: string) => request<void>('DELETE', `/restaurants/${restaurantId}/save`),
  mapPlaces: (query: MapPlacesQuery) => request<MapPlace[]>('GET', `/map/places${qs({ ...query })}`),

  asks: () => request<Ask[]>('GET', '/asks'),
  createAsk: (input: { question: string; areaLabel?: string }) => request<{ id: string }>('POST', '/asks', input),
  closeAsk: (id: string) => request<void>('DELETE', `/asks/${id}`),
  replyToAsk: (id: string, input: { restaurantId?: string; googlePlaceId?: string; note?: string }) =>
    request<{ id: string }>('POST', `/asks/${id}/replies`, input),
  deleteAskReply: (askId: string, id: string) => request<void>('DELETE', `/asks/${askId}/replies/${id}`),
  plans: () => request<PlanSummary[]>('GET', '/plans'),
  plan: (id: string) => request<Plan>('GET', `/plans/${id}`),
  createPlan: (input: { title: string; startsAt?: string; memberIds: string[] }) =>
    request<{ id: string }>('POST', '/plans', input),
  addPlanOption: (planId: string, place: { restaurantId?: string; googlePlaceId?: string }) =>
    request<{ id: string }>('POST', `/plans/${planId}/options`, place),
  removePlanOption: (planId: string, optionId: string) => request<void>('DELETE', `/plans/${planId}/options/${optionId}`),
  vote: (planId: string, optionId: string) => request<void>('PUT', `/plans/${planId}/options/${optionId}/vote`),
  unvote: (planId: string, optionId: string) => request<void>('DELETE', `/plans/${planId}/options/${optionId}/vote`),
  decidePlan: (planId: string, optionId: string) => request<void>('POST', `/plans/${planId}/decide`, { optionId }),
  leavePlan: (planId: string) => request<void>('POST', `/plans/${planId}/leave`),
  myLists: () => request<{ mine: ListSummary[]; following: ListSummary[] }>('GET', '/me/lists'),
  userLists: (username: string) => request<ListSummary[]>('GET', `/users/${encodeURIComponent(username)}/lists`),
  createList: (input: { title: string; description?: string; audience: 'friends' | 'private' }) =>
    request<{ id: string }>('POST', '/lists', input),
  list: (id: string) => request<RestaurantList>('GET', `/lists/${id}`),
  updateList: (id: string, input: { title?: string; description?: string; audience?: 'friends' | 'private' }) =>
    request<{ id: string }>('PATCH', `/lists/${id}`, input),
  deleteList: (id: string) => request<void>('DELETE', `/lists/${id}`),
  addToList: (id: string, restaurantId: string, note = '') => request<void>('PUT', `/lists/${id}/items/${restaurantId}`, { note }),
  removeFromList: (id: string, restaurantId: string) => request<void>('DELETE', `/lists/${id}/items/${restaurantId}`),
  followList: (id: string) => request<void>('PUT', `/lists/${id}/follow`),
  unfollowList: (id: string) => request<void>('DELETE', `/lists/${id}/follow`),
  saveAllFromList: (id: string) => request<{ added: number }>('POST', `/lists/${id}/save-all`),
  forYou: (near?: { lat: number; lng: number } | null) =>
    request<ForYouItem[]>('GET', `/for-you${qs({ lat: near?.lat, lng: near?.lng })}`),
  wrapped: (year: number) => request<Wrapped>('GET', `/me/wrapped${qs({ year })}`),
  badges: (username: string) => request<Badge[]>('GET', `/users/${encodeURIComponent(username)}/badges`),
  feed: (cursor?: string) => request<Page<FeedItem>>('GET', `/feed${qs({ cursor })}`),
  requestUpload: (input: { kind: 'review' | 'avatar' | 'story' | 'plate'; contentType: string; bytes: number }) =>
    request<{ photoId: string; uploadUrl: string; headers: Record<string, string> }>('POST', '/uploads', input),
  confirmPhoto: (id: string, size: { width?: number; height?: number }) => request<{ id: string }>('POST', `/photos/${id}/confirm`, size),
  myVisits: () => request<Visit[]>('GET', '/me/visits'),
  tagged: () => request<TaggedVisit[]>('GET', '/me/tagged'),
  myVisitsAt: (restaurantId: string) => request<Visit[]>('GET', `/restaurants/${restaurantId}/my-visits`),
  untag: (visitId: string) => request<void>('DELETE', `/visits/${visitId}/companions/me`),
  createVisit: (input: CreateVisitInput) => request<Visit>('POST', '/visits', input),
  deleteVisit: (id: string) => request<void>('DELETE', `/visits/${id}`),
  setVisitAudience: (id: string, audience: VisitAudience) =>
    request<{ id: string; audience: VisitAudience }>('PATCH', `/visits/${id}`, { audience }),
  addReview: (visitId: string, input: ReviewInput) =>
    request<Review>('POST', `/visits/${visitId}/review`, input),
  updateReview: (id: string, input: UpdateReviewInput) => request<Review>('PATCH', `/reviews/${id}`, input),
  deleteReview: (id: string) => request<void>('DELETE', `/reviews/${id}`),
  react: (reviewId: string, kind: ReactionKind) => request<void>('PUT', `/reviews/${reviewId}/reactions/${kind}`),
  unreact: (reviewId: string, kind: ReactionKind) => request<void>('DELETE', `/reviews/${reviewId}/reactions/${kind}`),
  comments: (reviewId: string) => request<Comment[]>('GET', `/reviews/${reviewId}/comments`),
  addComment: (reviewId: string, body: string) => request<{ id: string }>('POST', `/reviews/${reviewId}/comments`, { body }),
  deleteComment: (id: string) => request<void>('DELETE', `/comments/${id}`),
};
