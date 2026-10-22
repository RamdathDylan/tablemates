import type { TasteMatch } from '@tablemates/shared';
import { Card, space, Text, useTheme } from '@tablemates/ui';
import { View } from 'react-native';

/** "92% taste match" plus where you agree, on a friend's profile. */
export function TasteCard({ taste, name }: { taste: TasteMatch; name: string }) {
  const { colors } = useTheme();
  if (taste.match === null) {
    return (
      <Card style={{ gap: space[1] }}>
        <Text variant="label">Taste match</Text>
        <Text variant="caption" tone="muted">
          Rate {Math.max(1, 3 - taste.overlap)} more place{3 - taste.overlap === 1 ? '' : 's'} you’ve both been to and we’ll compare your tastes.
        </Text>
      </Card>
    );
  }
  return (
    <Card style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }} accessibilityLabel={`${taste.match}% taste match with ${name}`}>
      <View
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text variant="heading" style={{ color: colors.onPrimarySoft }}>
          {taste.match}%
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label">Taste match</Text>
        <Text variant="caption" tone="muted">
          Based on {taste.overlap} places you’ve both rated.
        </Text>
        {taste.agree.slice(0, 2).map((a) => (
          <Text key={a.restaurant.id} variant="caption">
            {a.restaurant.name}: you {a.you}★, {name.split(' ')[0]} {a.them}★
          </Text>
        ))}
      </View>
    </Card>
  );
}
