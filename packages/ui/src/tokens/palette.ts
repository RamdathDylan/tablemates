/**
 * Raw color scales. Components never use these directly; they use the semantic
 * roles in colors.ts so light and dark themes stay in sync.
 */
export const palette = {
  tomato: {
    50: '#FFF1EE',
    100: '#FFDCD4',
    200: '#FFB8A8',
    300: '#FF8F78',
    400: '#F2674D',
    500: '#E04A2F',
    600: '#C23A22',
    700: '#9C2E1B',
    800: '#742316',
    900: '#4D1810',
  },
  saffron: {
    50: '#FFF8E6',
    100: '#FFEDBF',
    200: '#FFDD85',
    300: '#FCC94A',
    400: '#F2B522',
    500: '#D99A0B',
    600: '#B07A06',
    700: '#855B07',
    800: '#5C3F07',
    900: '#3A2805',
  },
  stone: {
    0: '#FFFFFF',
    50: '#FAF8F6',
    100: '#F3F0EC',
    200: '#E7E2DC',
    300: '#D3CCC4',
    400: '#A9A098',
    450: '#8F867D',
    500: '#756C64',
    600: '#5E5650',
    700: '#45403B',
    800: '#2D2926',
    900: '#1C1A18',
    950: '#121110',
  },
  basil: { 50: '#EAF7EF', 400: '#4CC27E', 600: '#1E7543', 900: '#0F3820' },
  berry: { 50: '#FDECEE', 400: '#F2707A', 600: '#C42332', 900: '#4F0E14' },
  sky: { 50: '#EBF2FE', 400: '#7AA7F5', 600: '#2F62D0', 900: '#102654' },
} as const;
