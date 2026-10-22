import type { ForYouItem } from '@tablemates/shared';
import { Card, focusRing, IconButton, radius, Rating, space, Text, useTheme, type PressState } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { api } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { qk } from '@/lib/query-keys';
import { useSaveToggle } from '@/lib/use-save';

/** "Bob (94% match) gave it 5 stars", shown in compact form. */
export function reasonText(item: ForYouItem) {
  const top = item.reasons[0];
  if (!top) return `${item.recommends} friend${item.recommends === 1 ? '' : 's'} recommend it`;
  const who = top.match !== null ? `${top.user.displayName} (${top.match}% match)` : top.user.displayName;
  const more = item.reasons.length > 1 ? ` and ${item.reasons[1]!.user.displayName}` : '';
  return `${who}${more} gave it ${top.rating}★`;
}

export function useForYou() {
  const location = useLocation();
  return useQuery({ queryKey: qk.forYou(location.coords), queryFn: () => api.forYou(location.coords) });
}

/** Feed header: a swipeable row of places picked for you. Hidden until there's something to show. */
export function ForYouCarousel() {
  const forYou = useForYou();
  if (!forYou.data?.length) return null;
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="overline" tone="muted" role="heading">
        For you
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3], paddingRight: space[4] }}>
        {forYou.data.slice(0, 10).map((item) => (
          <ForYouCard key={item.restaurant.id} item={item} />
        ))}
      </ScrollView>
    </View>
  );
}

function ForYouCard({ item }: { item: ForYouItem }) {
  const { colors } = useTheme();
  const save = useSaveToggle();
  const top = item.reasons[0];
  // The bookmark sits beside the card's pressable area, never inside it (no nested buttons).
  return (
    <Card padding={0} style={{ width: 240 }}>
      <Pressable
        role="button"
        accessibilityLabel={`${item.restaurant.name}. ${reasonText(item)}`}
        onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.restaurant.id } })}
        style={(state: PressState) => [
          { padding: space[4], paddingRight: space[10], gap: space[2], borderRadius: radius.lg },
          (state.pressed || state.hovered) && { backgroundColor: colors.surfaceSunken },
          focusRing(state, colors),
        ]}>
        <Text variant="subheading" numberOfLines={1}>
          {item.restaurant.name}
        </Text>
        {top && <Rating value={top.rating} size="sm" />}
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {reasonText(item)}
        </Text>
        <Text variant="caption" tone="subtle" numberOfLines={1}>
          {[item.restaurant.cuisine[0], item.distanceKm !== null ? `${item.distanceKm} km` : null].filter(Boolean).join(' · ') ||
            item.restaurant.address}
        </Text>
      </Pressable>
      <View style={{ position: 'absolute', top: space[2], right: space[2] }}>
        <IconButton
          icon={item.saved ? 'bookmark' : 'bookmark-outline'}
          size="sm"
          aria-pressed={item.saved}
          accessibilityLabel={item.saved ? `Remove ${item.restaurant.name} from want to try` : `Save ${item.restaurant.name} to want to try`}
          onPress={() => save.mutate({ restaurantId: item.restaurant.id, saved: item.saved, name: item.restaurant.name })}
        />
      </View>
    </Card>
  );
}
