import { Badge, IconButton } from '@tablemates/ui';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useNotificationSummary } from '@/lib/notifications';

export function activityLabel(unread: number) {
  return unread ? `Activity, ${unread} unread` : 'Activity';
}

/** Bell with an unread count, for phone headers (the sidebar has its own Activity item). */
export function ActivityBell() {
  const unread = useNotificationSummary().data?.unread ?? 0;
  return (
    <View>
      <IconButton
        icon={unread ? 'notifications' : 'notifications-outline'}
        variant="secondary"
        accessibilityLabel={activityLabel(unread)}
        onPress={() => router.push('/activity')}
      />
      <View style={{ position: 'absolute', top: -4, right: -4 }} pointerEvents="none">
        <Badge count={unread} />
      </View>
    </View>
  );
}
