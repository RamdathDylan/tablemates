import type {
  ApiError as ApiErrorBody,
  AuthResponse,
  CreateVisitInput,
  FeedItem,
  FriendRequest,
  FriendshipStatus,
  LoginInput,
  MapPlace,
  MapPlacesQuery,
  Me,
  NotificationSummary,
  Page,
  PlaceResult,
  Profile,
  PublicUser,
  RestaurantDetail,
  SavedPlace,
  Review,
  ReviewInput,
  SignupInput,
  UpdateProfileInput,
  UpdateReviewInput,
  UserSearchResult,
  Visit,
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

  friends: () => request<PublicUser[]>('GET', '/friends'),
  friendRequests: () => request<FriendRequest[]>('GET', '/friends/requests'),
  sendFriendRequest: (username: string) =>
    request<{ status: FriendshipStatus; requestId: string }>('POST', '/friends/requests', { username }),
  acceptFriendRequest: (id: string) => request<{ status: 'friends' }>('POST', `/friends/requests/${id}/accept`),
  declineFriendRequest: (id: string) => request<void>('POST', `/friends/requests/${id}/decline`),
  removeFriend: (userId: string) => request<void>('DELETE', `/friends/${userId}`),

  notificationSummary: () => request<NotificationSummary>('GET', '/notifications/summary'),
  markNotificationsRead: (ids: string[]) => request<void>('POST', '/notifications/read', { ids }),

  searchPlaces: (q: string, near?: { lat: number; lng: number } | null) =>
    request<PlaceResult[]>('GET', `/places/search${qs({ q, lat: near?.lat, lng: near?.lng })}`),
  restaurant: (id: string) => request<RestaurantDetail>('GET', `/restaurants/${id}`),
  saved: () => request<SavedPlace[]>('GET', '/me/saved'),
  savePlace: (restaurantId: string) => request<void>('PUT', `/restaurants/${restaurantId}/save`),
  unsavePlace: (restaurantId: string) => request<void>('DELETE', `/restaurants/${restaurantId}/save`),
  mapPlaces: (query: MapPlacesQuery) => request<MapPlace[]>('GET', `/map/places${qs({ ...query })}`),

  feed: (cursor?: string) => request<Page<FeedItem>>('GET', `/feed${qs({ cursor })}`),
  myVisits: () => request<Visit[]>('GET', '/me/visits'),
  createVisit: (input: CreateVisitInput) => request<Visit>('POST', '/visits', input),
  deleteVisit: (id: string) => request<void>('DELETE', `/visits/${id}`),
  addReview: (visitId: string, input: ReviewInput) =>
    request<Review>('POST', `/visits/${visitId}/review`, input),
  updateReview: (id: string, input: UpdateReviewInput) => request<Review>('PATCH', `/reviews/${id}`, input),
  deleteReview: (id: string) => request<void>('DELETE', `/reviews/${id}`),
};
