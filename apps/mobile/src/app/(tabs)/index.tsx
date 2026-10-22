import { Button, EmptyState, ReviewCard, space, Text, useBreakpoint, useTheme } from '@tablemates/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { ActivityBell } from '@/components/activity-bell';
import { CommentsSheet } from '@/components/comments-sheet';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { useContentStyle } from '@/components/screen';
import { api } from '@/lib/api';
import { useDocumentTitle } from '@/lib/use-document-title';
import { qk } from '@/lib/query-keys';
import { useReaction } from '@/lib/use-engagement';
import { useSaveToggle } from '@/lib/use-save';

export default function FeedScreen() {
  const { colors } = useTheme();
  const content = useContentStyle();
  useDocumentTitle('Feed');
  const bp = useBreakpoint();
  const save = useSaveToggle();
  const react = useReaction();
  const [thread, setThread] = useState<{ reviewId: string; title: string } | null>(null);
  const feed = useInfiniteQuery({
    queryKey: qk.feed,
    queryFn: ({ pageParam }) => api.feed(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={content}
      data={items}
      keyExtractor={(item) => item.review.id}
      refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} />}
      ListHeaderComponent={
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[3] }}>
          <View style={{ flex: 1, gap: space[1] }}>
            <Text variant="title">From your friends</Text>
            <Text tone="muted">Only people you’ve added can recommend here.</Text>
          </View>
          {bp === 'phone' && <ActivityBell />}
        </View>
      }
      ListEmptyComponent={
        feed.isPending ? (
          <LoadingCards />
        ) : feed.isError ? (
          <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
        ) : (
          <EmptyState
            icon="people-outline"
            title="Your table is empty"
            message="Add friends to see where they've been eating and what they recommend."
            action={{ label: 'Find friends', onPress: () => router.navigate('/friends') }}
          />
        )
      }
      renderItem={({ item }) => (
        <ReviewCard
          author={item.author}
          restaurantName={item.restaurant.name}
          rating={item.review.rating}
          body={item.review.body}
          recommends={item.review.recommends}
          dishes={item.review.dishes}
          visitedAt={item.visitedAt}
          onPressAuthor={() => router.push({ pathname: '/user/[username]', params: { username: item.author.username } })}
          onPressRestaurant={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.restaurant.id } })}
          saved={item.saved}
          onToggleSave={() => save.mutate({ restaurantId: item.restaurant.id, saved: item.saved, name: item.restaurant.name })}
          companions={item.companions.map((c) => c.displayName)}
          engagement={item.engagement}
          onReact={(kind) => react.mutate({ reviewId: item.review.id, kind, on: item.engagement.mine.includes(kind) })}
          onOpenComments={() => setThread({ reviewId: item.review.id, title: `${item.author.displayName} at ${item.restaurant.name}` })}
        />
      )}
      onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        feed.hasNextPage ? (
          <Button
            title="Load more"
            variant="secondary"
            onPress={() => feed.fetchNextPage()}
            loading={feed.isFetchingNextPage}
            style={{ alignSelf: 'center' }}
          />
        ) : undefined
      }
    />
    {thread && <CommentsSheet reviewId={thread.reviewId} title={thread.title} onClose={() => setThread(null)} />}
    </>
  );
}
