import type { PublicUser } from '@tablemates/shared';
import { Avatar, Input, Sheet, space, Text, useTheme, focusRing, type PressState } from '@tablemates/ui';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

/** Choose a friend from a searchable list (map filter, tagging companions). */
export function FriendPicker({
  visible,
  friends,
  onPick,
  onClose,
  title = "Show one friend's places",
  actionLabel = (f) => `Show ${f.displayName}'s places`,
}: {
  visible: boolean;
  friends: PublicUser[];
  onPick: (friend: PublicUser) => void;
  onClose: () => void;
  title?: string;
  actionLabel?: (friend: PublicUser) => string;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const shown = friends.filter((f) =>
    `${f.displayName} ${f.username}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {friends.length > 6 && <Input label="Search friends" hideLabel icon="search" placeholder="Search friends" value={q} onChangeText={setQ} />}
      {friends.length === 0 && <Text tone="muted">Add friends to filter the map by them.</Text>}
      <View role="list">
        {shown.map((f) => (
          <Pressable
            key={f.id}
            role="button"
            accessibilityLabel={actionLabel(f)}
            onPress={() => onPick(f)}
            style={(state: PressState) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                minHeight: 52,
                paddingHorizontal: space[2],
                borderRadius: 10,
                backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : 'transparent',
              },
              focusRing(state, colors),
            ]}>
            <Avatar name={f.displayName} uri={f.avatarUrl} decorative />
            <View>
              <Text variant="bodyStrong">{f.displayName}</Text>
              <Text variant="caption" tone="muted">
                @{f.username}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
