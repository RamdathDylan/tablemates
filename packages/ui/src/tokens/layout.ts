/** 4pt spacing scale. Use these for padding, margin, and gap. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;
export type Space = keyof typeof space;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const borderWidth = { hairline: 1, thick: 2 } as const;

/** Elevation as CSS box-shadow, supported by React Native's new architecture and web. */
export function elevation(level: 0 | 1 | 2 | 3, shadowColor: string): string | undefined {
  switch (level) {
    case 0:
      return undefined;
    case 1:
      return `0px 1px 2px 0px ${shadowColor}`;
    case 2:
      return `0px 4px 12px 0px ${shadowColor}`;
    case 3:
      return `0px 12px 32px 0px ${shadowColor}`;
  }
}

/** Minimum touch target (WCAG 2.5.8 / platform guidelines). */
export const minTouchTarget = 44;

/** Max width of a content column on wide (web/tablet) screens. */
export const maxContentWidth = 640;

export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  /** Cubic-bezier control points, for Easing.bezier(...). */
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
  },
} as const;
