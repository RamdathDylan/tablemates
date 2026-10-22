import { useWindowDimensions } from 'react-native';

import { breakpoints } from './tokens';

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/** The current layout size class. Re-renders when the window crosses a breakpoint. */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (width >= breakpoints.desktop) return 'desktop';
  if (width >= breakpoints.tablet) return 'tablet';
  return 'phone';
}
