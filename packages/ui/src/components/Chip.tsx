import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';
import { radius, space, type ColorRoles } from '../tokens';
import { Icon, type IconName } from './Icon';
import { focusRing, type PressState } from './internal';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'primary' | 'accent' | 'success';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
  icon?: IconName;
  /** Makes the chip a toggle (filters, "Recommend?" choices). */
  onPress?: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
}

const tones: Record<ChipTone, { bg: keyof ColorRoles; fg: keyof ColorRoles }> = {
  neutral: { bg: 'surfaceSunken', fg: 'textMuted' },
  primary: { bg: 'primarySoft', fg: 'onPrimarySoft' },
  accent: { bg: 'accentSoft', fg: 'onAccentSoft' },
  success: { bg: 'successSoft', fg: 'success' },
};

export function Chip({ label, tone = 'neutral', icon, onPress, selected, accessibilityLabel }: ChipProps) {
  const { colors } = useTheme();
  const t = selected ? { bg: 'primary' as const, fg: 'onPrimary' as const } : tones[tone];
  const box: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1],
    height: onPress ? 36 : 26,
    paddingHorizontal: onPress ? space[3] : space[2] + 2,
    borderRadius: radius.full,
    backgroundColor: colors[t.bg],
    alignSelf: 'flex-start',
  };
  const content = (
    <>
      {icon && <Icon name={icon} size={onPress ? 16 : 13} color={t.fg} />}
      <Text variant={onPress ? 'label' : 'caption'} style={{ color: colors[t.fg] }}>
        {label}
      </Text>
    </>
  );

  if (!onPress) return <View style={box}>{content}</View>;
  return (
    <Pressable
      role="button"
      aria-pressed={!!selected}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={4}
      onPress={onPress}
      style={(state: PressState) => [
        box,
        !selected && (state.pressed || state.hovered) && { backgroundColor: colors.border },
        focusRing(state, colors),
      ]}>
      {content}
    </Pressable>
  );
}
