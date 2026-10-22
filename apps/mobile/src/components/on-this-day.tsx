import type { Memory } from '@tablemates/shared';
import { Button, Card, Icon, IconButton, Rating, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { isWeb } from '@/lib/config';
import { qk } from '@/lib/query-keys';

const KEY = 'tablemates.memoryDismissed';
const today = () => new Date().toLocaleDateString('en-CA');

/** Remembers which day the card was dismissed; failures just mean it shows again. */
const dismissedStore = {
  async get(): Promise<string | null> {
    try {
      return isWeb ? globalThis.localStorage?.getItem(KEY) ?? null : await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  async set(value: string) {
    try {
      if (isWeb) globalThis.localStorage?.setItem(KEY, value);
      else await SecureStore.setItemAsync(KEY, value);
    } catch {
      // Not critical.
    }
  },
};

/** Feed: "A year ago you were at Joe's with Bob". Dismissible for the day; never pushed. */
export function OnThisDayCard() {
  const date = today();
  const memories = useQuery({ queryKey: qk.memories(date), queryFn: () => api.memories(date) });
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  useEffect(() => {
    void dismissedStore.get().then((d) => setDismissed(d === date));
  }, [date]);

  const memory = memories.data?.[0];
  if (!memory || dismissed !== false) return null;
  return (
    <Card style={{ gap: space[3] }} role="region" aria-label="On this day">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Icon name="time-outline" color="primary" />
        <Text variant="overline" tone="muted" style={{ flex: 1 }}>
          On this day
        </Text>
        <IconButton
          icon="close"
          size="sm"
          accessibilityLabel="Hide today's memory"
          onPress={() => {
            setDismissed(true);
            void dismissedStore.set(date);
          }}
        />
      </View>
      <MemoryBody memory={memory} />
      {memories.data!.length > 1 && (
        <Text variant="caption" tone="muted">
          +{memories.data!.length - 1} more from this day
        </Text>
      )}
    </Card>
  );
}

function MemoryBody({ memory: m }: { memory: Memory }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const friend = m.companions[0];
  const invite = useMutation({
    mutationFn: async () => {
      const { id } = await api.createPlan({ title: `Back to ${m.restaurant.name}`, memberIds: m.companions.map((c) => c.id) });
      await api.addPlanOption(id, { restaurantId: m.restaurant.id });
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: qk.plans });
      router.push({ pathname: '/plan/[id]', params: { id } });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't start the plan.", 'danger'),
  });
  const withWho = m.companions.length ? ` with ${m.companions.map((c) => c.displayName.split(' ')[0]).join(', ')}` : '';
  return (
    <>
      <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
        {m.photos[0] && (
          <Image source={{ uri: m.photos[0].url }} accessibilityLabel={`Your photo from ${m.restaurant.name}`} style={{ width: 64, height: 64, borderRadius: 10 }} />
        )}
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="subheading">
            {m.label[0]!.toUpperCase() + m.label.slice(1)} you were at {m.restaurant.name}
            {withWho}
          </Text>
          {m.rating !== null && <Rating value={m.rating} size="sm" />}
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        <Button
          title="Go again"
          icon="add-circle-outline"
          size="sm"
          onPress={() =>
            router.navigate({ pathname: '/log', params: { googlePlaceId: m.restaurant.googlePlaceId, name: m.restaurant.name, address: m.restaurant.address } })
          }
        />
        {friend && (
          <Button
            title={m.companions.length > 1 ? 'Invite them' : `Invite ${friend.displayName.split(' ')[0]}`}
            icon="calendar-outline"
            size="sm"
            variant="secondary"
            loading={invite.isPending}
            onPress={() => invite.mutate()}
          />
        )}
      </View>
    </>
  );
}
