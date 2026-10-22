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
  onPress?: () => void;
}

export function RestaurantCard({ name, address, cuisine = [], priceLevel, friendStats, onPress }: RestaurantCardProps) {
  const price = priceLabel(priceLevel);
  const summary =
    friendStats && friendStats.recommends > 0
      ? `${friendStats.recommends} friend${friendStats.recommends === 1 ? '' : 's'} recommend`
      : friendStats && friendStats.visits > 0
        ? `${friendStats.visits} friend visit${friendStats.visits === 1 ? '' : 's'}`
        : null;

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={[name, address, summary].filter(Boolean).join(', ')}
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
      {summary && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Chip label={summary} tone="primary" icon="people" />
          {friendStats?.averageRating != null && <Rating value={friendStats.averageRating} size="sm" />}
        </View>
      )}
    </Card>
  );
}
