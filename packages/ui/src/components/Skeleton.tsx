import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { useTheme } from '../theme';
import { motion, radius as radii } from '../tokens';
import { useReducedMotion } from './internal';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: keyof typeof radii;
}

/** Loading placeholder. Pulses unless the user prefers reduced motion. */
export function Skeleton({ width = '100%', height = 16, radius = 'sm' }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: motion.duration.slow * 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: motion.duration.slow * 2, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reduced]);

  return (
    <Animated.View
      aria-hidden
      style={{ width, height, borderRadius: radii[radius], backgroundColor: colors.surfaceSunken, opacity }}
    />
  );
}
