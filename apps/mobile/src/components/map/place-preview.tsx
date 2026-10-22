import type { MapPlace } from '@tablemates/shared';
import {
  Avatar,
  Button,
  Card,
  Chip,
  elevation,
  IconButton,
  priceLabel,
  Rating,
  space,
  Text,
  useTheme,
} from '@tablemates/ui';
import { router } from 'expo-router';

import { openDirections } from '@/lib/maps-link';
import { useSaveToggle } from '@/lib/use-save';

import { OpenChip } from '../essentials';
import { ScrollView, View } from 'react-native';

/** Details for the selected pin: your stars, each friend's stars, and the latest review. */
export function PlacePreview({ place, onClose }: { place: MapPlace; onClose: () => void }) {
  const { colors } = useTheme();
  const r = place.restaurant;
  const price = priceLabel(r.priceLevel);
  const others = place.friends.count - place.friends.visitors.length;
  const save = useSaveToggle();

  return (
    <Card padding={0} style={{ boxShadow: elevation(3, colors.shadow), maxHeight: 440 }} role="region" aria-label={`${r.name} details`}>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3] }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="heading" numberOfLines={2}>
              {r.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[r.cuisine.slice(0, 2).join(' · '), price].filter(Boolean).join(' · ') || r.address}
            </Text>
          </View>
          <IconButton icon="close" accessibilityLabel="Close details" size="sm" onPress={onClose} />
        </View>

        <OpenChip restaurant={r} />

        {place.summary.averageRating !== null && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
            <Rating value={place.summary.averageRating} />
            {place.summary.recommends > 0 && (
              <Chip tone="primary" icon="thumbs-up" label={`${place.summary.recommends} recommend`} />
            )}
          </View>
        )}

        {place.me && (
          <Row label="You">
            {place.me.rating !== null ? <Rating value={place.me.rating} size="sm" /> : <Text variant="caption" tone="muted">Visited, no review</Text>}
            {place.me.recommends && <Chip tone="accent" icon="thumbs-up" label="You recommend" />}
          </Row>
        )}

        {place.friends.visitors.map((v) => (
          <Row
            key={v.user.id}
            label={v.user.displayName}
            avatar={{ name: v.user.displayName, uri: v.user.avatarUrl }}
            onPress={() => router.push({ pathname: '/user/[username]', params: { username: v.user.username } })}>
            {v.rating !== null ? <Rating value={v.rating} size="sm" /> : <Text variant="caption" tone="muted">Visited, no review</Text>}
            {v.recommends && <Chip tone="primary" icon="thumbs-up" label="Recommends" />}
          </Row>
        ))}
        {others > 0 && (
          <Text variant="caption" tone="muted">
            and {others} more friend{others === 1 ? '' : 's'}
          </Text>
        )}

        {place.latestReview && (
          <View style={{ borderLeftWidth: 3, borderLeftColor: colors.primarySoft, paddingLeft: space[3], gap: 2 }}>
            <Text numberOfLines={3}>“{place.latestReview.body}”</Text>
            <Text variant="caption" tone="muted">
              {place.latestReview.author.displayName}
            </Text>
          </View>
        )}

        {place.summary.visits === 0 && (
          <Text variant="caption" tone="muted">
            On your want-to-try list. None of your friends have been yet.
          </Text>
        )}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <View style={{ flex: 1 }}>
            <Button
              title="Open restaurant"
              icon="arrow-forward"
              fullWidth
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
            />
          </View>
          <IconButton
            icon="navigate"
            variant="secondary"
            size="lg"
            accessibilityLabel={`Directions to ${r.name}`}
            onPress={() => openDirections(r)}
          />
          <IconButton
            icon={place.saved ? 'bookmark' : 'bookmark-outline'}
            variant="secondary"
            size="lg"
            aria-pressed={place.saved}
            accessibilityLabel={place.saved ? `Remove ${r.name} from want to try` : `Save ${r.name} to want to try`}
            onPress={() => save.mutate({ restaurantId: r.id, saved: place.saved, name: r.name })}
          />
        </View>
      </ScrollView>
    </Card>
  );
}

function Row({
  label,
  avatar,
  onPress,
  children,
}: {
  label: string;
  avatar?: { name: string; uri: string | null };
  onPress?: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      {avatar && <Avatar name={avatar.name} uri={avatar.uri} size="sm" decorative />}
      <Text variant="label" onPress={onPress} role={onPress ? 'link' : undefined} style={{ minWidth: 48 }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
