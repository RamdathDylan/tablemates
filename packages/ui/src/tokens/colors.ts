import { palette as p } from './palette';

/** Semantic color roles. Every component reads colors from here. */
export interface ColorRoles {
  /** App background behind everything. */
  bg: string;
  /** Cards, sheets, inputs. */
  surface: string;
  /** Subtle fills: chips, skeletons, pressed rows. */
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  /** Form field outlines. Darker than border so fields meet 3:1 (WCAG 1.4.11). */
  borderInput: string;
  text: string;
  textMuted: string;
  /** Smallest-emphasis text. Still meets 4.5:1 on bg. */
  textSubtle: string;
  textInverse: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  accent: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  star: string;
  starEmpty: string;
  focusRing: string;
  overlay: string;
  /** Box-shadow color for elevation. */
  shadow: string;
}

export const lightColors: ColorRoles = {
  bg: p.stone[50],
  surface: p.stone[0],
  surfaceSunken: p.stone[100],
  border: p.stone[200],
  borderStrong: p.stone[300],
  borderInput: p.stone[450],
  text: p.stone[900],
  textMuted: p.stone[600],
  textSubtle: p.stone[500],
  textInverse: p.stone[0],
  primary: p.tomato[600],
  primaryPressed: p.tomato[700],
  onPrimary: p.stone[0],
  primarySoft: p.tomato[50],
  onPrimarySoft: p.tomato[800],
  accent: p.saffron[400],
  onAccent: p.stone[900],
  accentSoft: p.saffron[50],
  onAccentSoft: p.saffron[800],
  success: p.basil[600],
  successSoft: p.basil[50],
  danger: p.berry[600],
  dangerPressed: p.berry[900],
  dangerSoft: p.berry[50],
  info: p.sky[600],
  infoSoft: p.sky[50],
  star: p.saffron[500],
  starEmpty: p.stone[300],
  focusRing: p.sky[600],
  overlay: 'rgba(18, 17, 16, 0.5)',
  shadow: 'rgba(28, 26, 24, 0.12)',
};

export const darkColors: ColorRoles = {
  bg: p.stone[950],
  surface: p.stone[900],
  surfaceSunken: p.stone[800],
  border: p.stone[800],
  borderStrong: p.stone[700],
  borderInput: p.stone[500],
  text: p.stone[50],
  textMuted: p.stone[300],
  textSubtle: p.stone[400],
  textInverse: p.stone[900],
  primary: p.tomato[400],
  primaryPressed: p.tomato[300],
  onPrimary: p.stone[950],
  primarySoft: p.tomato[900],
  onPrimarySoft: p.tomato[100],
  accent: p.saffron[300],
  onAccent: p.stone[950],
  accentSoft: p.saffron[900],
  onAccentSoft: p.saffron[100],
  success: p.basil[400],
  successSoft: p.basil[900],
  danger: p.berry[400],
  dangerPressed: p.berry[50],
  dangerSoft: p.berry[900],
  info: p.sky[400],
  infoSoft: p.sky[900],
  star: p.saffron[400],
  starEmpty: p.stone[700],
  focusRing: p.sky[400],
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.5)',
};
