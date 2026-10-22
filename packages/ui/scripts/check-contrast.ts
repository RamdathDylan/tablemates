/**
 * Fails if any text/background pairing in either theme drops below WCAG AA.
 * Run with `pnpm --filter @tablemates/ui test` after changing colors.
 */
import { darkColors, lightColors, type ColorRoles } from '../src/tokens/colors';

type Role = keyof ColorRoles;

// [foreground, background, minimum ratio]. 4.5 for text, 3 for UI boundaries and icons.
const pairs: [Role, Role, number][] = [
  ['text', 'bg', 4.5],
  ['text', 'surface', 4.5],
  ['textMuted', 'bg', 4.5],
  ['textMuted', 'surface', 4.5],
  ['textMuted', 'surfaceSunken', 4.5],
  ['textSubtle', 'bg', 4.5],
  ['textSubtle', 'surface', 4.5],
  ['onPrimary', 'primary', 4.5],
  ['onPrimary', 'danger', 4.5],
  ['onPrimarySoft', 'primarySoft', 4.5],
  ['onAccentSoft', 'accentSoft', 4.5],
  ['onAccent', 'accent', 4.5],
  ['success', 'successSoft', 4.5],
  ['primary', 'surface', 4.5],
  ['primary', 'bg', 4.5],
  ['danger', 'surface', 4.5],
  ['textInverse', 'text', 4.5],
  ['borderInput', 'surface', 3],
  ['focusRing', 'bg', 3],
  ['focusRing', 'surface', 3],
];

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

let failures = 0;
for (const [name, colors] of [['light', lightColors], ['dark', darkColors]] as const) {
  for (const [fg, bg, min] of pairs) {
    const ratio = contrast(colors[fg], colors[bg]);
    const ok = ratio >= min;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${fg} on ${bg}: ${ratio.toFixed(2)} (min ${min})`);
  }
}
if (failures) {
  console.error(`\n${failures} contrast failure(s)`);
  process.exit(1);
}
console.log('\nAll color pairs meet WCAG AA');
