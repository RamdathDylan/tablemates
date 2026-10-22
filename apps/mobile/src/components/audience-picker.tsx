import type { VisitAudience } from '@tablemates/shared';
import { Chip, type IconName, space, Text } from '@tablemates/ui';
import { View } from 'react-native';

export const audiences: Record<VisitAudience, { label: string; icon: IconName; help: string }> = {
  friends: { label: 'Friends', icon: 'people', help: 'All your friends can see this visit and review.' },
  close_friends: { label: 'Close friends', icon: 'star', help: 'Only people on your close friends list can see it.' },
  private: { label: 'Only me', icon: 'lock-closed', help: 'Just for your own records. Nobody else sees it.' },
};

/** Who can see a visit. Used when logging and when editing a visit later. */
export function AudiencePicker({ value, onChange }: { value: VisitAudience; onChange: (a: VisitAudience) => void }) {
  return (
    <View style={{ gap: space[2] }}>
      <View role="radiogroup" accessibilityLabel="Who can see this" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {(Object.keys(audiences) as VisitAudience[]).map((a) => (
          <Chip key={a} label={audiences[a].label} icon={audiences[a].icon} selected={value === a} onPress={() => onChange(a)} />
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {audiences[value].help}
      </Text>
    </View>
  );
}
