import { View } from 'react-native';

import { useTheme } from '../theme';
import { radius, space } from '../tokens';
import { Text } from './Text';

/**
 * Charts follow the dataviz rules: one series, so no legend (the surrounding
 * title names it); one hue; 4px-rounded data ends anchored to the baseline;
 * 2px gaps between bars; a direct label on the peak only; and an accessible
 * label listing every value, which doubles as the table view.
 */

export interface ColumnChartProps {
  values: number[];
  /** One short label per value ("J", "F", …). */
  labels: string[];
  /** Spoken names per value ("January"…), for the accessible summary. */
  spokenLabels?: string[];
  unit: string;
  height?: number;
}

export function ColumnChart({ values, labels, spokenLabels = labels, unit, height = 120 }: ColumnChartProps) {
  const { colors } = useTheme();
  const max = Math.max(1, ...values);
  const peak = values.indexOf(Math.max(...values));
  const summary = values.map((v, i) => `${spokenLabels[i]}: ${v} ${unit}`).join(', ');

  return (
    <View role="img" accessibilityLabel={summary} style={{ gap: space[1] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 2 }} aria-hidden>
        {values.map((v, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}>
            {i === peak && v > 0 && (
              <Text variant="caption" style={{ marginBottom: 2 }}>
                {v}
              </Text>
            )}
            <View
              style={{
                width: '100%',
                // A visible sliver for zero keeps the baseline readable.
                height: v ? Math.max(4, (v / max) * (height - 20)) : 2,
                backgroundColor: v ? colors.primary : colors.border,
                borderTopLeftRadius: v ? 4 : 0,
                borderTopRightRadius: v ? 4 : 0,
              }}
            />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 2 }} aria-hidden>
        {labels.map((l, i) => (
          <Text key={i} variant="caption" tone="subtle" align="center" style={{ flex: 1, fontSize: 11 }}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

export interface RankedBarsProps {
  items: { label: string; value: number }[];
  unit: string;
  /** Scale bars to a fixed total (e.g. a challenge target) instead of the longest bar. */
  max?: number;
}

/** Horizontal bars, longest first, each labeled with its name and value. */
export function RankedBars({ items, unit, max: fixedMax }: RankedBarsProps) {
  const { colors } = useTheme();
  const max = Math.max(1, fixedMax ?? 0, ...items.map((i) => i.value));
  return (
    <View role="list" style={{ gap: space[3] }}>
      {items.map((item) => (
        <View key={item.label} role="listitem" accessibilityLabel={`${item.label}: ${item.value} ${unit}`} style={{ gap: space[1] }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} aria-hidden>
            <Text variant="label">{item.label}</Text>
            <Text variant="caption" tone="muted">
              {item.value} {unit}
            </Text>
          </View>
          <View style={{ height: 10, borderRadius: radius.full, backgroundColor: colors.surfaceSunken }} aria-hidden>
            <View
              style={{ width: `${(item.value / max) * 100}%`, height: 10, borderRadius: radius.full, backgroundColor: colors.primary }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
