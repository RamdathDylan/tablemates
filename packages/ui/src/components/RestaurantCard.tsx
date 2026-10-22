import { View } from 'react-native';

import { priceLabel } from '../format';
import { space } from '../tokens';
import { Card } from './Card';
import { Chip } from './Chip';
import { Icon } from './Icon';
import { Rating } from './Rating';
import { Text } from './Text';

export interface RestaurantCardProps {
  name: string;
  address: string;
  cuisine?: string[];
  priceLevel?: number | null;
  /** What the viewer's friends think. Omit for search results. */
  friendStats?: { visits: number; recommends: number; averageRating: number | null };
  /** Set when the viewer has been; shows their own rating. */
  you?: { rating: number | null; recommends: boolean | null };
  /** Distance from the viewer, e.g. on a "nearest" list. */
  distanceKm?: number | null;
  onPress?: () => void;
}

export function RestaurantCard({
  name,
  address,
  cuisine = [],
  priceLevel,
  friendStats,
  you,
  distanceKm,
  onPress,
}: RestaurantCardProps) {
  const price = priceLabel(priceLevel);
  const summary =
    friendStats && friendStats.recommends > 0
      ? `${friendStats.recommends} ${friendStats.recommends === 1 ? 'friend recommends' : 'friends recommend'}`
      : friendStats && friendStats.visits > 0
        ? `${friendStats.visits} friend visit${friendStats.visits === 1 ? '' : 's'}`
        : null;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[name, address, summary, you && (you.rating !== null ? `you rated it ${you.rating} stars` : "you've been")]
        .filter(Boolean)
        .join(', ')}
      style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
        <Text variant="heading" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
        {price && (
          <Text variant="label" tone="muted">
            {price}
          </Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        <Icon name="location-outline" size={14} color="textSubtle" />
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {distanceKm != null ? `${distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm} km`} · ` : ''}
          {address}
        </Text>
      </View>
      {cuisine.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[1] }}>
          {cuisine.slice(0, 3).map((c) => (
            <Chip key={c} label={c} />
          ))}
        </View>
      )}
      {(summary || you) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          {summary && <Chip label={summary} tone="primary" icon="people" />}
          {friendStats?.averageRating != null && <Rating value={friendStats.averageRating} size="sm" />}
          {you && (
            <Chip
              tone="accent"
              icon={you.recommends ? 'thumbs-up' : 'checkmark'}
              label={you.rating !== null ? `You: ${you.rating}★` : "You've been"}
            />
          )}
        </View>
      )}
    </Card>
  );
}
