import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme';
import { minTouchTarget, radius, space, type ColorRoles } from '../tokens';
import { Icon, type IconName } from './Icon';
import { focusRing, type PressState } from './internal';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  loading?: boolean;
  fullWidth?: boolean;
  /** Layout only (margins, alignment). Colors and sizing come from variant and size. */
  style?: StyleProp<ViewStyle>;
}

const sizes = {
  sm: { height: 40, paddingHorizontal: space[3], icon: 16, text: 'label' as const },
  md: { height: 44, paddingHorizontal: space[4], icon: 18, text: 'bodyStrong' as const },
  lg: { height: 52, paddingHorizontal: space[6], icon: 20, text: 'bodyStrong' as const },
};

function variantColors(variant: ButtonVariant, c: ColorRoles, pressed: boolean) {
  switch (variant) {
    case 'primary':
      return { bg: pressed ? c.primaryPressed : c.primary, fg: 'onPrimary' as const, border: undefined };
    case 'danger':
      return { bg: pressed ? c.dangerPressed : c.danger, fg: 'onPrimary' as const, border: undefined };
    case 'secondary':
      return { bg: pressed ? c.surfaceSunken : c.surface, fg: 'text' as const, border: c.borderStrong };
    case 'ghost':
      return { bg: pressed ? c.primarySoft : 'transparent', fg: 'primary' as const, border: undefined };
  }
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  disabled,
  fullWidth,
  accessibilityLabel,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const s = sizes[size];
  const inactive = disabled || loading;
  const hitSlop = Math.max(0, (minTouchTarget - s.height) / 2);

  return (
    <Pressable
      role="button"
      accessibilityLabel={accessibilityLabel ?? title}
      aria-disabled={!!inactive}
      aria-busy={loading}
      disabled={inactive}
      hitSlop={hitSlop}
      style={(state: PressState) => {
        const v = variantColors(variant, colors, state.pressed || !!state.hovered);
        return [
          styles.base,
          {
            height: s.height,
            paddingHorizontal: s.paddingHorizontal,
            backgroundColor: v.bg,
            borderColor: v.border ?? 'transparent',
            opacity: disabled ? 0.45 : 1,
            alignSelf: fullWidth ? 'stretch' : 'flex-start',
          },
          focusRing(state, colors),
          style,
        ];
      }}
      {...rest}>
      {(state: PressState) => {
        const v = variantColors(variant, colors, state.pressed);
        return (
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator size="small" color={colors[v.fg]} />
            ) : icon ? (
              <Icon name={icon} size={s.icon} color={v.fg} />
            ) : null}
            <Text variant={s.text} style={{ color: colors[v.fg] }} numberOfLines={1}>
              {title}
            </Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
