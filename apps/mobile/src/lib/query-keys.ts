/** React Query keys, in one place so mutations invalidate the right caches. */
export const qk = {
  feed: ['feed'] as const,
  myVisits: ['visits', 'me'] as const,
  userVisits: (username: string) => ['visits', username] as const,
  profile: (username: string) => ['profile', username] as const,
  friends: ['friends'] as const,
  friendRequests: ['friendRequests'] as const,
  userSearch: (q: string) => ['userSearch', q] as const,
  places: (q: string) => ['places', q] as const,
  restaurant: (id: string) => ['restaurant', id] as const,
};
