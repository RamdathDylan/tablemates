import type { Checkin } from '@tablemates/shared';
import { Avatar, Button, Card, Chip, focusRing, Icon, radius, Sheet, space, Text, timeAgo, useTheme, useToast, type PressState } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

const until = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const openRestaurant = (id: string) => router.push({ pathname: '/restaurant/[id]', params: { id } });

export function useCheckins() {
  return useQuery({ queryKey: qk.checkins, queryFn: api.checkins, refetchInterval: 60_000 });
}

function useEndCheckin() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: api.endCheckin,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.checkins });
      toast('You’re no longer showing as out', 'neutral');
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't end it.", 'danger'),
  });
}

/** Restaurant page: "I'm here", or your live status when you're already checked in here. */
export function CheckInButton({ restaurant }: { restaurant: { id: string; name: string } }) {
  const checkins = useCheckins();
  const end = useEndCheckin();
  const [open, setOpen] = useState(false);
  const mine = checkins.data?.mine;
  if (mine?.restaurant.id === restaurant.id) {
    return (
      <Button
        title={`You’re here until ${until(mine.expiresAt)} · End`}
        icon="radio-button-on"
        variant="secondary"
        accessibilityLabel={`You're checked in here until ${until(mine.expiresAt)}. End check-in`}
        loading={end.isPending}
        onPress={() => end.mutate()}
      />
    );
  }
  return (
    <>
      <Button title="I’m here" icon="location-outline" variant="secondary" onPress={() => setOpen(true)} />
      {open && <CheckInSheet restaurant={restaurant} replacing={mine ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

function CheckInSheet({ restaurant, replacing, onClose }: { restaurant: { id: string; name: string }; replacing: Checkin | null; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [audience, setAudience] = useState<'friends' | 'close_friends'>('friends');
  const [hours, setHours] = useState(3);
  const [alert, setAlert] = useState(false);
  const checkIn = useMutation({
    mutationFn: () => api.checkIn({ restaurantId: restaurant.id, audience, hours, notifyCloseFriends: alert }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.checkins });
      toast(`You’re out at ${restaurant.name}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't check in.", 'danger'),
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Out at ${restaurant.name}?`}
      footer={<Button title="Check in" icon="location" fullWidth size="lg" loading={checkIn.isPending} onPress={() => checkIn.mutate()} />}>
      <Text tone="muted">Friends will see you’re here until it ends. It’s never based on your location, only on this button.</Text>
      {replacing && (
        <Text variant="caption" tone="muted">
          This ends your check-in at {replacing.restaurant.name}.
        </Text>
      )}
      <View style={{ gap: space[2] }}>
        <Text variant="label">Who sees it</Text>
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Chip label="Friends" icon="people" selected={audience === 'friends'} onPress={() => setAudience('friends')} />
          <Chip label="Close friends" icon="star" selected={audience === 'close_friends'} onPress={() => setAudience('close_friends')} />
        </View>
      </View>
      <View style={{ gap: space[2] }}>
        <Text variant="label">For how long</Text>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {[1, 3, 6].map((h) => (
            <Chip key={h} label={`${h} hour${h === 1 ? '' : 's'}`} selected={hours === h} onPress={() => setHours(h)} />
          ))}
        </View>
      </View>
      <Chip label="Alert my close friends" icon={alert ? 'notifications' : 'notifications-outline'} selected={alert} onPress={() => setAlert(!alert)} />
    </Sheet>
  );
}

/** Feed: your live check-in, then friends who are out right now. */
export function OutNowStrip() {
  const { colors } = useTheme();
  const checkins = useCheckins();
  const end = useEndCheckin();
  const data = checkins.data;
  if (!data || (!data.mine && !data.friends.length)) return null;
  return (
    <View style={{ gap: space[2] }} role="region" aria-label="Out now">
      {data.mine && (
        <Card padding={3} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], borderColor: colors.success, borderWidth: 2 }}>
          <Icon name="radio-button-on" color="success" />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">You’re out at {data.mine.restaurant.name}</Text>
            <Text variant="caption" tone="muted">
              {data.mine.audience === 'close_friends' ? 'Close friends' : 'Friends'} can see it until {until(data.mine.expiresAt)}
            </Text>
          </View>
          <Button title="End" size="sm" variant="secondary" loading={end.isPending} onPress={() => end.mutate()} />
        </Card>
      )}
      {data.friends.length > 0 && (
        <>
          <Text variant="overline" tone="muted">
            Out now
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            {data.friends.map((c) => (
              <Pressable
                key={c.id}
                role="button"
                accessibilityLabel={`${c.user.displayName} is at ${c.restaurant.name}, checked in ${timeAgo(c.createdAt)} ago`}
                onPress={() => openRestaurant(c.restaurant.id)}
                style={(state: PressState) => [
                  {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space[2],
                    paddingVertical: space[2],
                    paddingLeft: space[2],
                    paddingRight: space[3],
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : colors.surface,
                    maxWidth: 260,
                  },
                  focusRing(state, colors),
                ]}>
                <Avatar name={c.user.displayName} uri={c.user.avatarUrl} size="sm" ring decorative />
                <View style={{ flexShrink: 1 }}>
                  <Text variant="label" numberOfLines={1}>
                    {c.user.displayName}
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {c.restaurant.name} · {timeAgo(c.createdAt)}
                  </Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

/** A friend on the map: their avatar with "here · 20m". The map supplies the accessible label. */
export function CheckinMarker({ checkin }: { checkin: Checkin }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        padding: 3,
        paddingRight: space[2],
        borderRadius: radius.full,
        backgroundColor: colors.surface,
        borderWidth: 2,
        borderColor: colors.success,
      }}>
      <Avatar name={checkin.user.displayName} uri={checkin.user.avatarUrl} size="sm" decorative />
      <Text variant="caption">here · {timeAgo(checkin.createdAt)}</Text>
    </View>
  );
}

export const checkinLabel = (c: Checkin) => `${c.user.displayName} is at ${c.restaurant.name} now`;
