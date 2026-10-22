import type { Friend } from '@tablemates/shared';
import { Avatar, Button, Card, Chip, EmptyState, RestaurantCard, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { FriendPicker } from '@/components/friend-picker';
import { AvatarStack } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';

/** Blend: where you and some friends should eat together. Friends live in the URL (`?with=id,id`). */
export default function BlendScreen() {
  const params = useLocalSearchParams<{ with?: string }>();
  const ids = (params.with ?? '').split(',').filter(Boolean);
  const me = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const blend = useQuery({ queryKey: qk.blend(ids), queryFn: () => api.blend(ids), enabled: ids.length > 0 });
  const [picking, setPicking] = useState(false);
  const setIds = (next: string[]) => router.setParams({ with: next.join(',') || undefined });

  const plan = useMutation({
    mutationFn: async () => {
      const b = blend.data!;
      const others = b.participants.filter((p) => p.id !== me.id);
      const { id } = await api.createPlan({ title: `Dinner with ${others.map((p) => p.displayName.split(' ')[0]).join(', ')}`, memberIds: others.map((p) => p.id) });
      for (const p of b.places.slice(0, 3)) await api.addPlanOption(id, { restaurantId: p.restaurant.id });
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: qk.plans });
      toast('Plan started with your top 3 picks', 'success');
      router.push({ pathname: '/plan/[id]', params: { id } });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't start the plan.", 'danger'),
  });

  const chosen = ids.map((id) => friends.data?.find((f) => f.id === id)).filter((f): f is Friend => !!f);

  return (
    <Screen header documentTitle="Blend">
      <Stack.Screen options={{ title: 'Blend' }} />
      <View style={{ gap: space[1] }}>
        <Text variant="display">Blend</Text>
        <Text tone="muted">Places your group will all like: someone loved it, nobody disliked it, and not everyone has been.</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {chosen.map((f) => (
          <Chip key={f.id} label={f.displayName} icon="close" tone="accent" accessibilityLabel={`Remove ${f.displayName} from the blend`} onPress={() => setIds(ids.filter((x) => x !== f.id))} />
        ))}
        {ids.length < 5 && <Chip label="Add a friend" icon="person-add" onPress={() => setPicking(true)} />}
      </View>

      {!ids.length ? (
        <EmptyState icon="people-outline" title="Pick friends to blend with" message="Add up to 5 friends to see where you should eat together." />
      ) : blend.isPending ? (
        <LoadingCards count={2} />
      ) : blend.isError ? (
        <ErrorState error={blend.error} onRetry={() => blend.refetch()} />
      ) : (
        <>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <AvatarStack people={blend.data.participants} max={6} />
            <View style={{ flex: 1 }}>
              <Text variant="heading">{blend.data.match !== null ? `${blend.data.match}% match` : 'New blend'}</Text>
              <Text variant="caption" tone="muted">
                {blend.data.match !== null ? 'Across everyone’s shared ratings' : 'Rate a few of the same places to see your match'}
              </Text>
            </View>
          </Card>
          {blend.data.places.length ? (
            <>
              <Button title="Make it a plan" icon="calendar" loading={plan.isPending} onPress={() => plan.mutate()} style={{ alignSelf: 'flex-start' }} />
              <Section title={`Picks · ${blend.data.places.length}`}>
                {blend.data.places.map((p) => (
                  <View key={p.restaurant.id} style={{ gap: space[1] }}>
                    <RestaurantCard
                      name={p.restaurant.name}
                      address={p.restaurant.address}
                      cuisine={p.restaurant.cuisine}
                      priceLevel={p.restaurant.priceLevel}
                      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: p.restaurant.id } })}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], paddingHorizontal: space[2] }}>
                      {p.lovedBy.map((l) => (
                        <View key={l.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }} accessible accessibilityLabel={`${l.user.displayName} rated it ${l.rating} stars`}>
                          <Avatar name={l.user.displayName} uri={l.user.avatarUrl} size="sm" decorative />
                          <Text variant="caption">★{l.rating}</Text>
                        </View>
                      ))}
                      <Text variant="caption" tone="muted">
                        New to {p.newTo.map((u) => (u.id === me.id ? 'you' : u.displayName.split(' ')[0])).join(', ')}
                      </Text>
                    </View>
                  </View>
                ))}
              </Section>
            </>
          ) : (
            <EmptyState icon="restaurant-outline" title="No picks yet" message="Once someone in the group rates a place 4★ or more, it shows up here." />
          )}
        </>
      )}
      <FriendPicker
        visible={picking}
        title="Add to the blend"
        actionLabel={(f) => `Blend with ${f.displayName}`}
        friends={(friends.data ?? []).filter((f) => !ids.includes(f.id))}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setPicking(false);
          setIds([...ids, f.id]);
        }}
      />
    </Screen>
  );
}
