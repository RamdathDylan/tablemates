import type { Badge } from '@tablemates/shared';
import { Icon, type IconName, radius, space, Text, useTheme } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { Section } from './screen';

/** Your profile: every badge, earned in color, locked ones with progress. A friend's: earned only. */
export function Passport({ username, own }: { username: string; own: boolean }) {
  const badges = useQuery({ queryKey: qk.badges(username), queryFn: () => api.badges(username) });
  if (!badges.data?.length) return null;
  const earned = badges.data.filter((b) => b.earnedAt).length;
  return (
    <Section title={own ? `Passport · ${earned} of ${badges.data.length}` : `Badges · ${earned}`}>
      <View role="list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {/* Earned first, then locked ones closest to done. */}
        {[...badges.data]
          .sort(
            (a, b) =>
              Number(!!b.earnedAt) - Number(!!a.earnedAt) ||
              (b.progress ? b.progress.current / b.progress.target : 0) - (a.progress ? a.progress.current / a.progress.target : 0),
          )
          .map((b) => (
            <BadgeTile key={b.key} badge={b} />
          ))}
      </View>
    </Section>
  );
}

function BadgeTile({ badge: b }: { badge: Badge }) {
  const { colors } = useTheme();
  const earned = !!b.earnedAt;
  const pct = b.progress ? b.progress.current / b.progress.target : earned ? 1 : 0;
  const label = earned
    ? `${b.title}, earned. ${b.description}`
    : `${b.title}, locked. ${b.description}${b.progress ? `. ${b.progress.current} of ${b.progress.target}` : ''}`;
  return (
    <View
      role="listitem"
      accessible
      accessibilityLabel={label}
      style={{
        width: 104,
        padding: space[2],
        gap: space[1],
        alignItems: 'center',
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: earned ? colors.primarySoft : colors.border,
        backgroundColor: earned ? colors.primarySoft : colors.surface,
      }}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: earned ? colors.primary : colors.surfaceSunken,
        }}>
        <Icon name={b.icon as IconName} size={22} color={earned ? 'onPrimary' : 'textSubtle'} />
      </View>
      <Text variant="label" align="center" numberOfLines={2} style={{ color: earned ? colors.onPrimarySoft : colors.textMuted }}>
        {b.title}
      </Text>
      {!earned && b.progress && (
        <View style={{ alignSelf: 'stretch', gap: 2 }}>
          <View style={{ height: 6, borderRadius: radius.full, backgroundColor: colors.surfaceSunken }}>
            <View style={{ width: `${pct * 100}%`, height: 6, borderRadius: radius.full, backgroundColor: colors.primary }} />
          </View>
          <Text variant="caption" tone="muted" align="center" style={{ fontSize: 11 }}>
            {b.progress.current}/{b.progress.target}
          </Text>
        </View>
      )}
    </View>
  );
}
