import type { NotificationType } from '@tablemates/shared';
import { Button, Card, Chip, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform, View } from 'react-native';

import { api } from '@/lib/api';
import { enablePush, pushStatus } from '@/lib/push';

import { Section } from './screen';

const labels: Record<NotificationType, string> = {
  friend_request: 'Friend requests',
  friend_accepted: 'Accepted requests',
  saved_place_reviewed: 'Reviews of places you saved',
  reaction: 'Reactions to your reviews',
  comment: 'Comments',
  tagged: 'Tags on visits',
  ask_reply: 'Answers to your questions',
  plan_invite: 'Dinner plan invites',
  plan_decided: 'When a plan is decided',
  badge: 'Badges you earn',
  story_reaction: 'Reactions to your stories',
  plate_prompt: 'Daily plate check',
  table_invite: 'Added to a table',
};

/** Push opt-in plus per-type toggles. Native only: the web app has no push. */
export function NotificationSettings() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['push', 'status'], queryFn: pushStatus, enabled: Platform.OS !== 'web' });
  const settings = useQuery({
    queryKey: ['push', 'settings'],
    queryFn: api.notificationSettings,
    enabled: status.data === 'enabled',
  });
  const update = useMutation({
    mutationFn: api.updateNotificationSettings,
    onSuccess: (s) => queryClient.setQueryData(['push', 'settings'], s),
  });

  if (Platform.OS === 'web' || !status.data) return null;

  async function turnOn() {
    const result = await enablePush();
    queryClient.setQueryData(['push', 'status'], result);
    if (result === 'denied') toast('Notifications are off for TableMates. Turn them on in Settings.', 'danger');
  }

  return (
    <Section title="Push notifications">
      <Card style={{ gap: space[3] }}>
        {status.data === 'unavailable' && (
          <Text variant="caption" tone="muted">
            Push needs the TableMates app on a phone (development builds need an EAS project).
          </Text>
        )}
        {(status.data === 'undetermined' || status.data === 'denied') && (
          <>
            <Text tone="muted">Get a ping when friends add you or review a place you saved.</Text>
            <Button title="Turn on notifications" icon="notifications" onPress={turnOn} />
          </>
        )}
        {status.data === 'enabled' && settings.data && (
          <View style={{ gap: space[2] }}>
            <Text variant="caption" tone="muted">
              Choose what sends a push. Everything still shows in Activity.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {(Object.keys(labels) as NotificationType[]).map((type) => {
                const on = !settings.data.mutedPush.includes(type);
                return (
                  <Chip
                    key={type}
                    label={labels[type]}
                    icon={on ? 'notifications' : 'notifications-off-outline'}
                    selected={on}
                    onPress={() =>
                      update.mutate({
                        mutedPush: on
                          ? [...settings.data.mutedPush, type]
                          : settings.data.mutedPush.filter((t) => t !== type),
                      })
                    }
                  />
                );
              })}
            </View>
          </View>
        )}
      </Card>
    </Section>
  );
}
