import { useToast } from '@tablemates/ui';
import { focusManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { api } from './api';
import { qk } from './query-keys';

/**
 * Refetch stale queries when a native app returns to the foreground. React Query
 * already does this on web via window focus events.
 */
export function useAppFocusRefetch() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
    return () => sub.remove();
  }, []);
}

/** Badge counts and unread alerts, polled while the app is open. */
export function useNotificationSummary() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: api.notificationSummary,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

function acceptedMessage(names: string[]) {
  if (names.length === 1) return `${names[0]} accepted your friend request`;
  if (names.length === 2) return `${names[0]} and ${names[1]} accepted your friend requests`;
  return `${names[0]} and ${names.length - 1} others accepted your friend requests`;
}

/** Shows a toast when someone accepts your friend request, then marks it read. */
export function useAcceptedAlerts() {
  const { data } = useNotificationSummary();
  const toast = useToast();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: api.markNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.notifications });
      // New friends mean new reviews and a new friends list.
      for (const key of [qk.friends, qk.friendRequests, qk.feed]) queryClient.invalidateQueries({ queryKey: key });
    },
  });
  const unread = data?.unreadAccepted ?? [];
  const ids = unread.map((a) => a.id).join(',');

  useEffect(() => {
    if (!ids || markRead.isPending) return;
    toast(acceptedMessage(unread.map((a) => a.user.displayName)), 'success');
    markRead.mutate(ids.split(','));
    // Keyed on the id list so each batch is announced exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
}
