import type { NotificationItem } from '@tablemates/shared';
import {
  Avatar,
  Button,
  EmptyState,
  focusRing,
  Icon,
  type IconName,
  radius,
  space,
  Text,
  timeAgo,
  useTheme,
  type PressState,
} from '@tablemates/ui';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, Pressable, View } from 'react-native';

import { ErrorState, LoadingCards } from '@/components/query-state';
import { useContentStyle } from '@/components/screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useFriendActions } from '@/lib/use-friend-actions';

const icons: Record<NotificationItem['type'], IconName> = {
  friend_request: 'person-add',
  friend_accepted: 'people',
  saved_place_reviewed: 'bookmark',
  reaction: 'heart',
  comment: 'chatbubble',
  tagged: 'pricetag',
};

function message(n: NotificationItem) {
  const who = n.actor.displayName;
  switch (n.type) {
    case 'friend_request':
      return n.pendingRequestId ? `${who} wants to be friends` : `${who} sent you a friend request`;
    case 'friend_accepted':
      return `${who} accepted your friend request`;
    case 'saved_place_reviewed':
      return `${who} reviewed ${n.restaurant?.name ?? 'a place'} from your Want to try list`;
    case 'reaction':
      return n.reaction === 'going'
        ? `${who} is going to ${n.restaurant?.name ?? 'a place'} after your review`
        : `${who} said yum to your ${n.restaurant?.name ?? ''} review`;
    case 'comment':
      return `${who} commented: “${n.excerpt ?? ''}”`;
    case 'tagged':
      return `${who} tagged you at ${n.restaurant?.name ?? 'a restaurant'}. Add your rating?`;
  }
}

function open(n: NotificationItem) {
  if (n.type === 'tagged') return router.navigate('/profile');
  if (n.type !== 'friend_request' && n.type !== 'friend_accepted' && n.restaurant) {
    router.push({ pathname: '/restaurant/[id]', params: { id: n.restaurant.id } });
  } else {
    router.push({ pathname: '/user/[username]', params: { username: n.actor.username } });
  }
}

export default function ActivityScreen() {
  useDocumentTitle('Activity');
  const { colors } = useTheme();
  const content = useContentStyle();
  const queryClient = useQueryClient();
  const inbox = useInfiniteQuery({
    queryKey: qk.inbox,
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const readAll = useMutation({
    mutationFn: api.readAllNotifications,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.notifications }),
  });
  const items = inbox.data?.pages.flatMap((p) => p.items) ?? [];
  const hasUnread = items.some((i) => !i.read);

  // Opening the inbox counts as reading it. Rows keep their unread styling until the next visit.
  useEffect(() => {
    if (hasUnread && !readAll.isPending && !readAll.isSuccess) readAll.mutate();
  }, [hasUnread, readAll]);

  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const firstEarlier = items.findIndex((i) => new Date(i.createdAt).getTime() < startOfToday);

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[content, { gap: space[1] }]}
      data={items}
      keyExtractor={(n) => n.id}
      ListHeaderComponent={
        <>
          <Text variant="title">Activity</Text>
          {firstEarlier !== 0 && items.length > 0 && <GroupLabel>Today</GroupLabel>}
        </>
      }
      renderItem={({ item, index }) => (
        <>
          {index === firstEarlier && <GroupLabel>Earlier</GroupLabel>}
          <Row n={item} />
        </>
      )}
      ListEmptyComponent={
        inbox.isPending ? (
          <LoadingCards count={2} />
        ) : inbox.isError ? (
          <ErrorState error={inbox.error} onRetry={() => inbox.refetch()} />
        ) : (
          <EmptyState
            icon="notifications-outline"
            title="You're all caught up"
            message="Friend requests and news about places on your Want to try list show up here."
          />
        )
      }
      onEndReached={() => inbox.hasNextPage && !inbox.isFetchingNextPage && inbox.fetchNextPage()}
    />
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <Text variant="overline" tone="muted" role="heading" style={{ marginTop: space[3], marginBottom: space[1] }}>
      {children}
    </Text>
  );
}

/** Screen-reader form of timeAgo: "just now", "5 minutes ago", "on Oct 1, 2026". */
function spokenTime(iso: string) {
  const short = timeAgo(iso);
  const m = /^(\d+)([mhd])$/.exec(short);
  if (short === 'now') return 'just now';
  if (!m) return `on ${short}`;
  const unit = { m: 'minute', h: 'hour', d: 'day' }[m[2] as 'm' | 'h' | 'd'];
  return `${m[1]} ${unit}${m[1] === '1' ? '' : 's'} ago`;
}

function Row({ n }: { n: NotificationItem }) {
  const { colors } = useTheme();
  const actions = useFriendActions();
  const text = message(n);

  // Inline actions sit outside the row's pressable so buttons are never nested.
  return (
    <View style={{ borderRadius: radius.md, backgroundColor: n.read ? 'transparent' : colors.primarySoft }}>
      <Pressable
        role="button"
        accessibilityLabel={`${n.read ? '' : 'Unread. '}${text}, ${spokenTime(n.createdAt)}`}
        onPress={() => open(n)}
        style={(state: PressState) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            padding: space[3],
            borderRadius: radius.md,
            backgroundColor: n.read && (state.pressed || state.hovered) ? colors.surfaceSunken : 'transparent',
          },
          focusRing(state, colors),
        ]}>
        <View>
          <Avatar name={n.actor.displayName} uri={n.actor.avatarUrl} decorative />
          <View
            style={{
              position: 'absolute',
              right: -4,
              bottom: -4,
              width: 22,
              height: 22,
              borderRadius: radius.full,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Icon name={icons[n.type]} size={13} color="primary" />
          </View>
        </View>
        <Text variant={n.read ? 'body' : 'bodyStrong'} style={{ flex: 1 }}>
          {text} <Text variant="caption" tone="muted">· {timeAgo(n.createdAt)}</Text>
        </Text>
      </Pressable>
      {n.pendingRequestId && (
        <View style={{ flexDirection: 'row', gap: space[2], paddingLeft: space[3] + 40 + space[3], paddingBottom: space[3] }}>
          <Button
            title="Accept"
            size="sm"
            accessibilityLabel={`Accept ${n.actor.displayName}'s request`}
            loading={actions.accept.isPending}
            onPress={() => actions.accept.mutate(n.pendingRequestId!)}
          />
          <Button
            title="Decline"
            size="sm"
            variant="secondary"
            accessibilityLabel={`Decline ${n.actor.displayName}'s request`}
            onPress={() => actions.decline.mutate(n.pendingRequestId!)}
          />
        </View>
      )}
    </View>
  );
}
