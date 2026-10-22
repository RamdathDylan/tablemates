import { View } from 'react-native';

import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { Text } from './Text';

export interface BadgeProps {
  count: number;
  /** Larger counts show as "9+" so the bubble stays small. */
  max?: number;
}

/**
 * A count bubble for unread or pending items. Hidden from screen readers:
 * put the count in the parent's accessible label instead (e.g. "Friends, 2 pending requests").
 */
export function Badge({ count, max = 9 }: BadgeProps) {
  const { colors } = useTheme();
  if (count <= 0) return null;
  return (
    <View
      aria-hidden
      style={{
        // Border is included in the size, so a single digit is a 20px circle.
        minWidth: 20,
        height: 20,
        paddingHorizontal: space[1],
        borderRadius: radius.full,
        backgroundColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        // Separates the bubble from whatever icon it overlaps.
        borderWidth: 2,
        borderColor: colors.surface,
      }}>
      <Text variant="overline" style={{ color: colors.onPrimary, letterSpacing: 0, fontSize: 11, lineHeight: 14 }}>
        {count > max ? `${max}+` : count}
      </Text>
    </View>
  );
}
