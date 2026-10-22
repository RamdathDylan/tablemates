import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme } from '../theme';
import { textVariants, type ColorRoles, type TextVariant } from '../tokens';

export type TextTone = 'default' | 'muted' | 'subtle' | 'primary' | 'danger' | 'success' | 'inverse';

const toneRole: Record<TextTone, keyof ColorRoles> = {
  default: 'text',
  muted: 'textMuted',
  subtle: 'textSubtle',
  primary: 'primary',
  danger: 'danger',
  success: 'success',
  inverse: 'textInverse',
};

const headingVariants = new Set<TextVariant>(['display', 'title', 'heading']);

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
}

export function Text({ variant = 'body', tone = 'default', align, style, role, ...rest }: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      role={role ?? (headingVariants.has(variant) ? 'heading' : undefined)}
      style={[textVariants[variant], { color: colors[toneRole[tone]], textAlign: align }, style]}
      {...rest}
    />
  );
}
