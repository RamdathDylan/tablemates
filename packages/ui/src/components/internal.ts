import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, type PressableStateCallbackType, type ViewStyle } from 'react-native';

import type { ColorRoles } from '../tokens';

/** Pressable state including the hover/focus flags react-native-web adds. */
export type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Visible keyboard focus ring. Only web has keyboard focus to show. */
export function focusRing(state: PressState, colors: ColorRoles): ViewStyle | undefined {
  if (Platform.OS !== 'web' || !state.focused) return undefined;
  return { outlineColor: colors.focusRing, outlineWidth: 2, outlineStyle: 'solid', outlineOffset: 2 };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}
