import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../theme';
import type { ColorRoles } from '../tokens';

export type IconName = keyof typeof Ionicons.glyphMap;

export interface IconProps {
  name: IconName;
  size?: number;
  /** A color role name, or a raw color for special cases. */
  color?: keyof ColorRoles | (string & {});
  /** Set when the icon carries meaning on its own (no visible label next to it). */
  accessibilityLabel?: string;
}

export function Icon({ name, size = 20, color = 'text', accessibilityLabel }: IconProps) {
  const { colors } = useTheme();
  const resolved = color in colors ? colors[color as keyof ColorRoles] : color;
  return (
    <Ionicons
      name={name}
      size={size}
      color={resolved}
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      aria-hidden={!accessibilityLabel}
    />
  );
}
