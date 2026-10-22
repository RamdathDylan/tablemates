import type { Plan, PlanOption } from '@tablemates/shared';
import { Button, Card, Chip, EmptyState, IconButton, Sheet, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { PlacePicker, type PickedPlace } from '@/components/place-picker';
import { AvatarStack, formatWhen } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { openDirections } from '@/lib/maps-link';
import { qk } from '@/lib/query-keys';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const plan = useQuery({ queryKey: qk.plan(id), queryFn: () => api.plan(id) });
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.plan(id) });
    queryClient.invalidateQueries({ queryKey: qk.plans });
  };
  const onError = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'danger');
  const vote = useMutation({
    mutationFn: (o: PlanOption) => (o.voted ? api.unvote(id, o.id) : api.vote(id, o.id)),
    onSuccess: refresh,
    onError,
  });
  const remove = useMutation({ mutationFn: (o: PlanOption) => api.removePlanOption(id, o.id), onSuccess: refresh, onError });
  const decide = useMutation({
    mutationFn: (o: PlanOption) => api.decidePlan(id, o.id),
    onSuccess: () => {
      refresh();
      toast("It's decided! Everyone's been told.", 'success');
    },
    onError,
  });
  const leave = useMutation({
    mutationFn: () => api.leavePlan(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.plans });
      router.back();
    },
    onError,
  });

  if (plan.isPending) {
    return (
      <Screen header>
        <LoadingCards count={2} />
      </Screen>
    );
  }
  if (plan.isError) {
    return (
      <Screen header>
        <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
      </Screen>
    );
  }

  const p: Plan = plan.data;
  const open = p.status === 'open';
  const winner = p.options.find((o) => o.restaurant.id === p.decided?.id);

  return (
    <Screen header documentTitle={p.title}>
      <Stack.Screen options={{ title: p.title }} />
      <View style={{ gap: space[2] }}>
        <Text variant="display">{p.title}</Text>
        <Text tone="muted">{formatWhen(p.startsAt)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <AvatarStack people={p.members} max={6} />
          <Text variant="caption" tone="muted">
            {p.members.length} going · planned by {p.isCreator ? 'you' : p.creator.displayName}
          </Text>
        </View>
      </View>

      {p.decided && (
        <Card style={{ gap: space[3] }}>
          <Chip label="Decided" icon="checkmark-circle" tone="success" />
          <Text variant="heading">{p.decided.name}</Text>
          <Text tone="muted">{p.decided.address}</Text>
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            <Button title="Directions" icon="navigate" onPress={() => openDirections(p.decided!)} />
            <Button
              title="View restaurant"
              variant="secondary"
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: p.decided!.id } })}
            />
          </View>
          {winner && (
            <Text variant="caption" tone="muted">
              {winner.voters.length} vote{winner.voters.length === 1 ? '' : 's'}
            </Text>
          )}
        </Card>
      )}

      <Section
        title={open ? 'Vote on where to eat' : 'Options'}
        action={open ? <Button title="Add a place" icon="add" size="sm" variant="ghost" onPress={() => setAdding(true)} /> : undefined}>
        {p.options.length === 0 ? (
          <EmptyState
            icon="restaurant-outline"
            title="No places yet"
            message="Suggest somewhere from your Want to try list or search."
            action={{ label: 'Add a place', onPress: () => setAdding(true) }}
          />
        ) : (
          p.options.map((o, i) => (
            <Card key={o.id} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    variant="subheading"
                    role="link"
                    onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: o.restaurant.id } })}>
                    {o.restaurant.name}
                  </Text>
                  <Text variant="caption" tone="muted">
                    Suggested by {o.addedBy.displayName}
                    {open && i === 0 && o.voters.length > 0 ? ' · Leading' : ''}
                  </Text>
                </View>
                {open && o.canRemove && (
                  <IconButton icon="trash-outline" size="sm" accessibilityLabel={`Remove ${o.restaurant.name}`} onPress={() => remove.mutate(o)} />
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
                {open ? (
                  <Chip
                    label={`${o.voted ? 'Voted' : 'Vote'} · ${o.voters.length}`}
                    icon={o.voted ? 'checkmark' : 'thumbs-up-outline'}
                    selected={o.voted}
                    accessibilityLabel={`${o.voted ? 'Remove your vote for' : 'Vote for'} ${o.restaurant.name}, ${o.voters.length} votes`}
                    onPress={() => vote.mutate(o)}
                  />
                ) : (
                  <Text variant="label">
                    {o.voters.length} vote{o.voters.length === 1 ? '' : 's'}
                  </Text>
                )}
                {o.voters.length > 0 && <AvatarStack people={o.voters} />}
                {open && p.isCreator && (
                  <Button title="Pick this one" size="sm" variant="secondary" onPress={() => decide.mutate(o)} />
                )}
              </View>
            </Card>
          ))
        )}
      </Section>

      {!p.isCreator && open && <Button title="Leave plan" variant="ghost" size="sm" onPress={() => leave.mutate()} style={{ alignSelf: 'center' }} />}
      {adding && <AddOptionSheet planId={id} onClose={() => setAdding(false)} onAdded={refresh} />}
    </Screen>
  );
}

function AddOptionSheet({ planId, onClose, onAdded }: { planId: string; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [picked, setPicked] = useState<PickedPlace | null>(null);
  const add = useMutation({
    mutationFn: () => api.addPlanOption(planId, { restaurantId: picked?.restaurantId, googlePlaceId: picked?.googlePlaceId }),
    onSuccess: () => {
      onAdded();
      toast(`Added ${picked?.name}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't add it.", 'danger'),
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add a place"
      footer={<Button title={picked ? `Add ${picked.name}` : 'Pick a place'} fullWidth size="lg" disabled={!picked} loading={add.isPending} onPress={() => add.mutate()} />}>
      <PlacePicker value={picked} onChange={setPicked} />
    </Sheet>
  );
}
