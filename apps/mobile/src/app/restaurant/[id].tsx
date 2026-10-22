import { Button, Card, Chip, EmptyState, Icon, priceLabel, Rating, ReviewCard, space, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CommentsSheet } from '@/components/comments-sheet';
import { EssentialActions, HoursList, OpenChip } from '@/components/essentials';
import { AddToListSheet } from '@/components/lists';
import { AddToPlanSheet, AvatarStack } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useReaction } from '@/lib/use-engagement';
import { useSaveToggle } from '@/lib/use-save';

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: qk.restaurant(id), queryFn: () => api.restaurant(id) });
  const save = useSaveToggle();
  const react = useReaction();
  const [thread, setThread] = useState<{ reviewId: string; title: string } | null>(null);
  const [planning, setPlanning] = useState(false);
  const [listing, setListing] = useState(false);

  if (detail.isPending) {
    return (
      <Screen header>
        <LoadingCards count={2} />
      </Screen>
    );
  }
  if (detail.isError) {
    return (
      <Screen header>
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const { restaurant: r, reviews, friendStats, saved, topDishes } = detail.data;
  const price = priceLabel(r.priceLevel);

  return (
    <Screen header documentTitle={r.name}>
      <View style={{ gap: space[2] }}>
        <Text variant="display">{r.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Icon name="location-outline" size={16} color="textMuted" />
          <Text tone="muted" style={{ flexShrink: 1 }}>
            {r.address}
            {price ? ` · ${price}` : ''}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          <OpenChip restaurant={r} />
          {r.neighborhood && <Chip label={r.neighborhood} icon="location" />}
          {r.cuisine.map((c) => (
            <Chip key={c} label={c} />
          ))}
        </View>
        <EssentialActions restaurant={r} />
        <HoursList restaurant={r} />
      </View>

      {friendStats.visits > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          {friendStats.averageRating !== null && <Rating value={friendStats.averageRating} />}
          <Chip
            tone="primary"
            icon="thumbs-up"
            label={`Recommended in ${friendStats.recommends} of ${friendStats.visits} visit${friendStats.visits === 1 ? '' : 's'}`}
          />
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        <Button
          title="Log a visit here"
          icon="add-circle-outline"
          onPress={() =>
            router.navigate({
              pathname: '/log',
              params: { googlePlaceId: r.googlePlaceId, name: r.name, address: r.address },
            })
          }
        />
        <Button
          title={saved ? 'On your list' : 'Want to try'}
          icon={saved ? 'bookmark' : 'bookmark-outline'}
          variant="secondary"
          aria-pressed={saved}
          accessibilityLabel={saved ? `Remove ${r.name} from want to try` : `Save ${r.name} to want to try`}
          loading={save.isPending}
          onPress={() => save.mutate({ restaurantId: r.id, saved, name: r.name })}
        />
        <Button title="Add to a plan" icon="calendar-outline" variant="ghost" onPress={() => setPlanning(true)} />
        <Button title="Add to list" icon="list" variant="ghost" onPress={() => setListing(true)} />
      </View>
      {listing && <AddToListSheet restaurant={r} onClose={() => setListing(false)} />}
      {planning && <AddToPlanSheet restaurant={r} onClose={() => setPlanning(false)} />}

      {topDishes.length > 0 && (
        <Section title="What friends order">
          <Card style={{ gap: space[3] }}>
            {topDishes.map((d) => (
              <View key={d.name} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{d.name}</Text>
                  <Text variant="caption" tone="muted">
                    {d.orders} order{d.orders === 1 ? '' : 's'}
                  </Text>
                </View>
                {d.averageRating !== null && <Rating value={d.averageRating} size="sm" />}
                <AvatarStack people={d.people} max={3} />
              </View>
            ))}
          </Card>
        </Section>
      )}

      <Section title="From your table">
        {reviews.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title="No friend reviews yet"
            message="None of your friends have reviewed this place. Be the first."
          />
        ) : (
          reviews.map((item) => (
            <ReviewCard
              key={item.review.id}
              author={item.author}
              rating={item.review.rating}
              body={item.review.body}
              recommends={item.review.recommends}
              dishes={item.review.dishes}
              visitedAt={item.visitedAt}
              onPressAuthor={() => router.push({ pathname: '/user/[username]', params: { username: item.author.username } })}
              companions={item.companions.map((c) => c.displayName)}
              engagement={item.engagement}
              onReact={(kind) => react.mutate({ reviewId: item.review.id, kind, on: item.engagement.mine.includes(kind) })}
              onOpenComments={() => setThread({ reviewId: item.review.id, title: `${item.author.displayName} at ${r.name}` })}
            />
          ))
        )}
      </Section>
      {thread && <CommentsSheet reviewId={thread.reviewId} title={thread.title} onClose={() => setThread(null)} />}
    </Screen>
  );
}
