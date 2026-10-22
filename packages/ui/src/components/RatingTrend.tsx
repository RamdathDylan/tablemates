import { useState } from 'react';
import { View } from 'react-native';

import { formatDate } from '../format';
import { useTheme } from '../theme';
import { space } from '../tokens';
import { Text } from './Text';

export interface RatingTrendProps {
  /** Rated visits, any order; plotted oldest → newest. */
  points: { date: string; rating: number }[];
  height?: number;
}

const DOT = 10;

/**
 * One person's ratings of one place over time: 2px line, 10px dots ringed in
 * the surface color, recessive 1-star and 5-star guides, and first/last dates only. A
 * single series, so no legend; pair it with a list of the visits as the table view.
 */
export function RatingTrend({ points, height = 72 }: RatingTrendProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const pad = DOT / 2;
  const x = (i: number) => pad + (i / (sorted.length - 1)) * (width - 2 * pad);
  const y = (rating: number) => pad + ((5 - rating) / 4) * (height - 2 * pad);
  const label = `Your ratings over time: ${sorted.map((p) => `${p.rating} stars on ${formatDate(p.date)}`).join(', ')}`;

  return (
    <View role="img" accessibilityLabel={label} style={{ gap: space[1] }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ justifyContent: 'space-between', height }} aria-hidden>
          <Text variant="caption" tone="subtle">5★</Text>
          <Text variant="caption" tone="subtle">1★</Text>
        </View>
        <View style={{ flex: 1, height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)} aria-hidden>
          {/* Recessive guides at 5 stars and 1 star. */}
          {[5, 1].map((r) => (
            <View key={r} style={{ position: 'absolute', left: 0, right: 0, top: y(r), height: 1, backgroundColor: colors.border }} />
          ))}
          {width > 0 &&
            sorted.slice(1).map((p, i) => {
              const x1 = x(i), y1 = y(sorted[i]!.rating), x2 = x(i + 1), y2 = y(p.rating);
              const len = Math.hypot(x2 - x1, y2 - y1);
              return (
                <View
                  key={`seg-${i}`}
                  style={{
                    position: 'absolute',
                    left: (x1 + x2) / 2 - len / 2,
                    top: (y1 + y2) / 2 - 1,
                    width: len,
                    height: 2,
                    borderRadius: 1,
                    backgroundColor: colors.primary,
                    transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }],
                  }}
                />
              );
            })}
          {width > 0 &&
            sorted.map((p, i) => (
              <View
                key={`dot-${i}`}
                style={{
                  position: 'absolute',
                  left: x(i) - DOT / 2,
                  top: y(p.rating) - DOT / 2,
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: colors.surface,
                }}
              />
            ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: space[6] }} aria-hidden>
        <Text variant="caption" tone="subtle">{formatDate(sorted[0]!.date)}</Text>
        <Text variant="caption" tone="subtle">{formatDate(sorted.at(-1)!.date)}</Text>
      </View>
    </View>
  );
}
