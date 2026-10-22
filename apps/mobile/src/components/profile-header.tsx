import type { Profile } from '@tablemates/shared';
import { Avatar, Icon, space, Text } from '@tablemates/ui';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { StreakChip } from './streak';

export function ProfileHeader({ profile, actions }: { profile: Profile; actions?: ReactNode }) {
  const own = profile.friendship === 'self';
  return (
    <View style={{ alignItems: 'center', gap: space[2] }}>
      <Avatar name={profile.displayName} uri={profile.avatarUrl} size="xl" />
      <Text variant="title" align="center">
        {profile.displayName}
      </Text>
      <Text tone="muted">@{profile.username}</Text>
      {profile.homeCity && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
          <Icon name="location-outline" size={14} color="textMuted" />
          <Text variant="caption" tone="muted">
            {profile.homeCity}
          </Text>
        </View>
      )}
      {!!profile.bio && (
        <Text align="center" style={{ maxWidth: 420 }}>
          {profile.bio}
        </Text>
      )}
      {!!profile.streak?.current && (
        <View style={{ alignSelf: 'center' }}>
          <StreakChip streak={profile.streak} own={own} />
        </View>
      )}
      {profile.stats && (
        <View style={{ flexDirection: 'row', gap: space[8], marginTop: space[2] }}>
          <Stat label="Visits" value={profile.stats.visits} />
          <Stat label="Reviews" value={profile.stats.reviews} />
          <Stat label="Friends" value={profile.stats.friends} />
        </View>
      )}
      {actions && <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[2] }}>{actions}</View>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ alignItems: 'center' }} accessible accessibilityLabel={`${value} ${label}`}>
      <Text variant="heading">{value}</Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}
