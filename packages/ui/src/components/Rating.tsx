import { Pressable, View } from 'react-native';

import { useTheme } from '../theme';
import { space } from '../tokens';
import { Icon } from './Icon';
import { focusRing, type PressState } from './internal';
import { Text } from './Text';

export interface RatingProps {
  /** 0–5. Half values render a half star in display mode. */
  value: number;
  /** Provide to make it an input. */
  onChange?: (value: number) => void;
  size?: 'sm' | 'md' | 'lg';
  /** Shows the number next to the stars (display mode). Defaults to true. */
  showValue?: boolean;
}

const starSize = { sm: 14, md: 20, lg: 32 };
const labels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Outstanding'];

export function Rating({ value, onChange, size = 'md', showValue = true }: RatingProps) {
  const { colors } = useTheme();
  const px = starSize[size];

  if (!onChange) {
    return (
      <View
        role="img"
        accessibilityLabel={`Rated ${value} out of 5`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon
            key={n}
            name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'}
            size={px}
            color={value >= n - 0.5 ? 'star' : 'starEmpty'}
          />
        ))}
        {/* The number keeps the rating readable without relying on star color alone. */}
        {showValue && (
          <Text variant={size === 'sm' ? 'caption' : 'label'} tone="muted" style={{ marginLeft: space[1] }} aria-hidden>
            {Number.isInteger(value) ? value : value.toFixed(1)}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={{ gap: space[1] }}>
      <View role="radiogroup" accessibilityLabel="Rating" style={{ flexDirection: 'row', gap: space[1] }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            role="radio"
            aria-checked={value === n}
            accessibilityLabel={`${n} star${n > 1 ? 's' : ''}, ${labels[n]}`}
            onPress={() => onChange(n)}
            hitSlop={4}
            style={(state: PressState) => [
              { padding: 2, borderRadius: 6, opacity: state.pressed ? 0.6 : 1 },
              focusRing(state, colors),
            ]}>
            <Icon name={value >= n ? 'star' : 'star-outline'} size={px} color={value >= n ? 'star' : 'starEmpty'} />
          </Pressable>
        ))}
      </View>
      <Text variant="caption" tone="muted" aria-live="polite">
        {value ? labels[value] : 'Tap a star to rate'}
      </Text>
    </View>
  );
}
