import { Pressable, View } from 'react-native';

import { formatDate } from '../format';
import { useTheme } from '../theme';
import { minTouchTarget, radius, space } from '../tokens';
import { Icon } from './Icon';
import { focusRing, type PressState } from './internal';
import { Rating } from './Rating';
import { Text } from './Text';

export interface VisitListItemProps {
  restaurantName: string;
  visitedAt: string;
  /** Omit for a visit logged without a review. */
  rating?: number;
  recommends?: boolean;
  /** Replaces the date line, e.g. "Saved Oct 21" on a want-to-try list. */
  subtitle?: string;
  onPress?: () => void;
}

export function VisitListItem({ restaurantName, visitedAt, rating, recommends, subtitle, onPress }: VisitListItemProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      role={onPress ? 'button' : undefined}
      style={(state: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: minTouchTarget + space[4],
          paddingHorizontal: space[3],
          borderRadius: radius.md,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : 'transparent',
        },
        focusRing(state, colors),
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {restaurantName}
        </Text>
        <Text variant="caption" tone="muted">
          {subtitle ?? `${formatDate(visitedAt)}${rating === undefined ? ' · No review yet' : ''}`}
        </Text>
      </View>
      {rating !== undefined && <Rating value={rating} size="sm" showValue={false} />}
      {recommends && <Icon name="thumbs-up" size={16} color="primary" accessibilityLabel="Recommends" />}
      {onPress && <Icon name="chevron-forward" size={18} color="textSubtle" />}
    </Pressable>
  );
}
