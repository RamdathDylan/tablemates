import { Pressable, View, type ViewProps, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { elevation, radius, space } from '../tokens';
import { focusRing, type PressState } from './internal';

export interface CardProps extends ViewProps {
  /** Makes the whole card a button. Give it an accessibilityLabel that summarizes the card. */
  onPress?: () => void;
  padding?: 0 | 3 | 4 | 5;
  elevated?: boolean;
}

export function Card({ onPress, padding = 4, elevated = true, style, children, ...rest }: CardProps) {
  const { colors } = useTheme();
  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space[padding],
    boxShadow: elevated ? elevation(1, colors.shadow) : undefined,
  };

  if (!onPress) {
    return (
      <View style={[base, style]} {...rest}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      role="button"
      onPress={onPress}
      style={(state: PressState) => [
        base,
        (state.pressed || state.hovered) && {
          borderColor: colors.borderStrong,
          boxShadow: elevation(2, colors.shadow),
        },
        focusRing(state, colors),
        style as ViewStyle,
      ]}
      {...rest}>
      {children}
    </Pressable>
  );
}
