import { Image, View } from 'react-native';

import { useTheme } from '../theme';
import { palette, radius } from '../tokens';
import { Text } from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: AvatarSize;
  /** Highlight ring, e.g. for the signed-in user or a new friend. */
  ring?: boolean;
  /** Set when the name is already shown next to the avatar. */
  decorative?: boolean;
}

const dims: Record<AvatarSize, { box: number; text: 'caption' | 'label' | 'subheading' | 'heading' }> = {
  sm: { box: 32, text: 'caption' },
  md: { box: 40, text: 'label' },
  lg: { box: 56, text: 'subheading' },
  xl: { box: 88, text: 'heading' },
};

// Initials backgrounds. Picked by name so a person keeps the same color everywhere.
const tints = [
  { bg: palette.tomato[100], fg: palette.tomato[800] },
  { bg: palette.saffron[100], fg: palette.saffron[800] },
  { bg: palette.basil[50], fg: palette.basil[900] },
  { bg: palette.sky[50], fg: palette.sky[900] },
  { bg: palette.berry[50], fg: palette.berry[900] },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '')).toUpperCase() || '?';
}

function tintFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return tints[Math.abs(hash) % tints.length]!;
}

export function Avatar({ name, uri, size = 'md', ring, decorative }: AvatarProps) {
  const { colors } = useTheme();
  const d = dims[size];
  const tint = tintFor(name);
  const a11y = decorative
    ? { accessible: false, 'aria-hidden': true as const }
    : { accessible: true, role: 'img' as const, accessibilityLabel: name };

  return (
    <View
      {...a11y}
      style={{
        width: d.box,
        height: d.box,
        borderRadius: radius.full,
        backgroundColor: tint.bg,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: ring ? 2 : 0,
        borderColor: colors.primary,
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text variant={d.text} style={{ color: tint.fg }} aria-hidden>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
