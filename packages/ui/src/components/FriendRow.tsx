import { Pressable, View } from 'react-native';

import { useTheme } from '../theme';
import { space } from '../tokens';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { Chip } from './Chip';
import { IconButton } from './IconButton';
import { focusRing, type PressState } from './internal';
import { Text } from './Text';

export type FriendRowStatus = 'none' | 'outgoing' | 'incoming' | 'friends' | 'self';

export interface FriendRowProps {
  user: { displayName: string; username: string; avatarUrl?: string | null };
  status: FriendRowStatus;
  onPress?: () => void;
  onAdd?: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
  /** Disables actions while a request is in flight. */
  busy?: boolean;
  /** For friends: shows a star that adds or removes them from close friends. */
  closeFriend?: boolean;
  onToggleClose?: () => void;
}

export function FriendRow({
  user,
  status,
  onPress,
  onAdd,
  onAccept,
  onDecline,
  busy,
  closeFriend,
  onToggleClose,
}: FriendRowProps) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] }}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        role={onPress ? 'link' : undefined}
        accessibilityLabel={`${user.displayName}, @${user.username}`}
        style={(state: PressState) => [
          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], borderRadius: 8 },
          focusRing(state, colors),
        ]}>
        <Avatar name={user.displayName} uri={user.avatarUrl} decorative />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {user.displayName}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            @{user.username}
          </Text>
        </View>
      </Pressable>

      {status === 'none' && onAdd && (
        <Button title="Add" icon="person-add" size="sm" onPress={onAdd} loading={busy} />
      )}
      {status === 'outgoing' && (
        <Button
          title="Requested"
          size="sm"
          variant="secondary"
          onPress={onDecline}
          disabled={!onDecline || busy}
          accessibilityLabel={`Cancel friend request to ${user.displayName}`}
        />
      )}
      {status === 'incoming' && (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button
            title="Decline"
            size="sm"
            variant="secondary"
            onPress={onDecline}
            disabled={busy}
            accessibilityLabel={`Decline ${user.displayName}'s request`}
          />
          <Button
            title="Accept"
            size="sm"
            onPress={onAccept}
            loading={busy}
            accessibilityLabel={`Accept ${user.displayName}'s request`}
          />
        </View>
      )}
      {status === 'friends' && !onToggleClose && <Chip label="Friends" tone="success" icon="checkmark" />}
      {status === 'friends' && onToggleClose && (
        <IconButton
          icon={closeFriend ? 'star' : 'star-outline'}
          accessibilityLabel={closeFriend ? `Remove ${user.displayName} from close friends` : `Add ${user.displayName} to close friends`}
          aria-pressed={!!closeFriend}
          disabled={busy}
          onPress={onToggleClose}
        />
      )}
    </View>
  );
}
