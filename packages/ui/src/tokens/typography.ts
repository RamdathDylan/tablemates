import type { TextStyle } from 'react-native';

/**
 * Font family names as registered by @expo-google-fonts. Custom fonts on native
 * need one family per weight, so weight is picked by family, not fontWeight.
 */
export const fontFamily = {
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  display: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
} as const;

export const fontSize = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  md: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 26 },
  xl: { fontSize: 22, lineHeight: 28 },
  '2xl': { fontSize: 28, lineHeight: 34 },
  '3xl': { fontSize: 34, lineHeight: 40 },
} as const;

/** Named text styles. Prefer these over composing size + family by hand. */
export const textVariants = {
  display: { ...fontSize['3xl'], fontFamily: fontFamily.displayBold, letterSpacing: -0.5 },
  title: { ...fontSize['2xl'], fontFamily: fontFamily.display, letterSpacing: -0.3 },
  heading: { ...fontSize.xl, fontFamily: fontFamily.display },
  subheading: { ...fontSize.lg, fontFamily: fontFamily.bodySemibold },
  body: { ...fontSize.md, fontFamily: fontFamily.body },
  bodyStrong: { ...fontSize.md, fontFamily: fontFamily.bodySemibold },
  caption: { ...fontSize.sm, fontFamily: fontFamily.body },
  label: { ...fontSize.sm, fontFamily: fontFamily.bodySemibold },
  overline: {
    ...fontSize.xs,
    fontFamily: fontFamily.bodySemibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;
