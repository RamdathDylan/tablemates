import { Button, Card, Chip, EmptyState, Icon, PhotoViewer, priceLabel, Rating, ReviewCard, space, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { CommentsSheet } from '@/components/comments-sheet';
import { EssentialActions, HoursList, OpenChip } from '@/components/essentials';
import { AddToListSheet } from '@/components/lists';
import { CheckInButton } from '@/components/out-now';
import { AddToPlanSheet, AvatarStack } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { YourVisits } from '@/components/your-visits';
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
  const [viewer, setViewer] = useState<{ photos: { url: string; caption?: string }[]; index: number } | null>(null);

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

  const { restaurant: r, reviews, friendStats, saved, topDishes, photos, mayor } = detail.data;
  const gallery = photos.map((p) => ({ url: p.url, caption: `${p.author.displayName}` }));
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

      {mayor && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="ribbon" size={18} color="primary" />
          <Text style={{ flex: 1 }}>
            {mayor.user.displayName} is the mayor · {mayor.visits} visits in the last 60 days
          </Text>
        </View>
      )}
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
        <CheckInButton restaurant={r} />
        <Button title="Add to a plan" icon="calendar-outline" variant="ghost" onPress={() => setPlanning(true)} />
        <Button title="Add to list" icon="list" variant="ghost" onPress={() => setListing(true)} />
      </View>
      {listing && <AddToListSheet restaurant={r} onClose={() => setListing(false)} />}
      {planning && <AddToPlanSheet restaurant={r} onClose={() => setPlanning(false)} />}

      {photos.length > 0 && (
        <Section title="Friends' photos">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
            {photos.slice(0, 9).map((p, i) => (
              <Pressable
                key={p.id}
                role="button"
                accessibilityLabel={`Photo by ${p.author.displayName}, ${i + 1} of ${photos.length}`}
                onPress={() => setViewer({ photos: gallery, index: i })}>
                <Image source={{ uri: p.url }} style={{ width: 104, height: 104, borderRadius: 8 }} />
              </Pressable>
            ))}
          </View>
        </Section>
      )}

      <YourVisits restaurantId={r.id} />

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
              photos={item.review.photos}
              onOpenPhoto={(index) => setViewer({ photos: item.review.photos, index })}
              engagement={item.engagement}
              onReact={(kind) => react.mutate({ reviewId: item.review.id, kind, on: item.engagement.mine.includes(kind) })}
              onOpenComments={() => setThread({ reviewId: item.review.id, title: `${item.author.displayName} at ${r.name}` })}
            />
          ))
        )}
      </Section>
      <PhotoViewer
        photos={viewer?.photos ?? []}
        index={viewer?.index ?? null}
        onChange={(index) => setViewer(index === null || !viewer ? null : { ...viewer, index })}
      />
      {thread && <CommentsSheet reviewId={thread.reviewId} title={thread.title} onClose={() => setThread(null)} />}
    </Screen>
  );
}
