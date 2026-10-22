import { useToast } from '@tablemates/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from './api';
import { qk } from './query-keys';

/** Friend request mutations. Each one refreshes everything friendship affects. */
export function useFriendActions() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const onSettled = () => {
    for (const key of [qk.friends, qk.friendRequests, qk.notifications, qk.feed, ['userSearch'], ['profile'], ['visits'], ['restaurant']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
  const onError = (err: unknown) =>
    toast(err instanceof ApiError ? err.message : 'Something went wrong. Try again.', 'danger');

  return {
    add: useMutation({
      mutationFn: (username: string) => api.sendFriendRequest(username),
      onSuccess: (r) => toast(r.status === 'friends' ? "You're now friends" : 'Friend request sent', 'success'),
      onError,
      onSettled,
    }),
    accept: useMutation({
      mutationFn: (requestId: string) => api.acceptFriendRequest(requestId),
      onSuccess: () => toast("You're now friends", 'success'),
      onError,
      onSettled,
    }),
    decline: useMutation({
      mutationFn: (requestId: string) => api.declineFriendRequest(requestId),
      onError,
      onSettled,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => api.removeFriend(userId),
      onSuccess: () => toast('Removed from friends'),
      onError,
      onSettled,
    }),
  };
}
