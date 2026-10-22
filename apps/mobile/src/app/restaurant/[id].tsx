import { Button, Chip, EmptyState, Icon, priceLabel, Rating, ReviewCard, space, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const detail = useQuery({ queryKey: qk.restaurant(id), queryFn: () => api.restaurant(id) });

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

  const { restaurant: r, reviews, friendStats } = detail.data;
  const price = priceLabel(r.priceLevel);

  return (
    <Screen header>
      <View style={{ gap: space[2] }}>
        <Text variant="display">{r.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Icon name="location-outline" size={16} color="textMuted" />
          <Text tone="muted" style={{ flexShrink: 1 }}>
            {r.address}
            {price ? ` · ${price}` : ''}
          </Text>
        </View>
        {r.cuisine.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
            {r.cuisine.map((c) => (
              <Chip key={c} label={c} />
            ))}
          </View>
        )}
      </View>

      {(friendStats.averageRating !== null || friendStats.recommends > 0) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          {friendStats.averageRating !== null && <Rating value={friendStats.averageRating} />}
          {/* "Recommended in 0 of 5" reads as a warning; with no recommendations, say nothing. */}
          {friendStats.recommends > 0 && (
            <Chip
              tone="primary"
              icon="thumbs-up"
              label={`Recommended in ${friendStats.recommends} of ${friendStats.visits} visit${friendStats.visits === 1 ? '' : 's'}`}
            />
          )}
        </View>
      )}

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
            />
          ))
        )}
      </Section>
    </Screen>
  );
}
