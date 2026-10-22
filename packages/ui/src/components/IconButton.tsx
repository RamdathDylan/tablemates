import { Pressable, type PressableProps } from 'react-native';

import { useTheme } from '../theme';
import { minTouchTarget, radius } from '../tokens';
import { Icon, type IconName } from './Icon';
import { focusRing, type PressState } from './internal';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  icon: IconName;
  /** Required: there is no visible text, so this is what screen readers announce. */
  accessibilityLabel: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
}

const dims = { sm: { box: 32, icon: 18 }, md: { box: 40, icon: 20 }, lg: { box: 48, icon: 24 } };

export function IconButton({ icon, variant = 'ghost', size = 'md', disabled, ...rest }: IconButtonProps) {
  const { colors } = useTheme();
  const d = dims[size];
  const fg = variant === 'primary' ? 'onPrimary' : 'text';

  return (
    <Pressable
      role="button"
      aria-disabled={!!disabled}
      disabled={disabled}
      hitSlop={Math.max(0, (minTouchTarget - d.box) / 2)}
      style={(state: PressState) => {
        const active = state.pressed || state.hovered;
        const bg =
          variant === 'primary'
            ? active ? colors.primaryPressed : colors.primary
            : variant === 'secondary'
              ? active ? colors.surfaceSunken : colors.surface
              : active ? colors.surfaceSunken : 'transparent';
        return [
          {
            width: d.box,
            height: d.box,
            borderRadius: radius.full,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: bg,
            borderWidth: variant === 'secondary' ? 1 : 0,
            borderColor: colors.border,
            opacity: disabled ? 0.45 : 1,
          },
          focusRing(state, colors),
        ];
      }}
      {...rest}>
      <Icon name={icon} size={d.icon} color={fg} />
    </Pressable>
  );
}
