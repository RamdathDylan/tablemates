import type { Friend, PlanSummary } from '@tablemates/shared';
import {
  Avatar,
  Button,
  Card,
  Chip,
  focusRing,
  Icon,
  Input,
  radius,
  Sheet,
  space,
  Text,
  useTheme,
  useToast,
  type PressState,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { FriendPicker } from './friend-picker';
import { Section } from './screen';

/** "Fri, Oct 30 · 7:00 PM" */
export function formatWhen(iso: string | null) {
  if (!iso) return 'Date TBD';
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function AvatarStack({ people, max = 4 }: { people: { displayName: string; avatarUrl: string | null }[]; max?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row' }} accessible accessibilityLabel={people.map((p) => p.displayName).join(', ')}>
      {people.slice(0, max).map((p, i) => (
        <View key={p.displayName + i} style={{ marginLeft: i ? -8 : 0, borderRadius: radius.full, borderWidth: 2, borderColor: colors.surface }}>
          <Avatar name={p.displayName} uri={p.avatarUrl} size="sm" decorative />
        </View>
      ))}
      {people.length > max && (
        <Text variant="caption" tone="muted" style={{ marginLeft: space[1], alignSelf: 'center' }}>
          +{people.length - max}
        </Text>
      )}
    </View>
  );
}

/** Friends screen: your plans and a button to start one. */
export function PlansSection() {
  const plans = useQuery({ queryKey: qk.plans, queryFn: api.plans });
  const [creating, setCreating] = useState(false);
  return (
    <Section
      title="Dinner plans"
      action={<Button title="New plan" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
      {plans.data?.length ? (
        <View style={{ gap: space[2] }}>
          {plans.data.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Pick a night, invite friends, and vote on where to eat.
        </Text>
      )}
      {creating && <NewPlanSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

export function PlanRow({ plan }: { plan: PlanSummary }) {
  const { colors } = useTheme();
  const decided = plan.status === 'decided';
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${plan.title}, ${formatWhen(plan.startsAt)}, ${decided ? `at ${plan.decided?.name}` : `${plan.optionCount} options, voting open`}`}
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      style={(state: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          padding: space[3],
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : colors.surface,
        },
        focusRing(state, colors),
      ]}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.md,
          backgroundColor: decided ? colors.successSoft : colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Icon name={decided ? 'checkmark-circle' : 'calendar'} color={decided ? 'success' : 'primary'} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {plan.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {formatWhen(plan.startsAt)} · {decided ? plan.decided?.name : `${plan.optionCount} option${plan.optionCount === 1 ? '' : 's'}`}
        </Text>
      </View>
      <AvatarStack people={plan.members} max={3} />
    </Pressable>
  );
}

/**
 * With `table`, every member is invited; extra friends are optional.
 * `restaurantIds` become the plan's first options (e.g. a crawl's stops).
 */
export function NewPlanSheet({
  table,
  restaurantIds = [],
  defaultTitle = '',
  onClose,
}: {
  table?: { id: string; name: string; members: { id: string; displayName: string; avatarUrl: string | null }[] };
  restaurantIds?: string[];
  defaultTitle?: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const [title, setTitle] = useState(defaultTitle);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('19:00');
  const [invited, setInvited] = useState<Friend[]>([]);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string>();

  const create = useMutation({
    mutationFn: async () => {
      let startsAt: string | undefined;
      if (date) {
        const local = new Date(`${date}T${time || '19:00'}`);
        if (Number.isNaN(local.getTime())) throw new Error('Use YYYY-MM-DD and HH:MM for the date and time.');
        startsAt = local.toISOString();
      }
      const created = await api.createPlan({ title, startsAt, memberIds: invited.map((f) => f.id), tableId: table?.id });
      for (const restaurantId of restaurantIds) await api.addPlanOption(created.id, { restaurantId });
      return created;
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: qk.plans });
      if (table) queryClient.invalidateQueries({ queryKey: qk.table(table.id) });
      toast(table ? `Invited everyone at ${table.name}` : `Invited ${invited.length} friend${invited.length === 1 ? '' : 's'}`, 'success');
      onClose();
      router.push({ pathname: '/plan/[id]', params: { id } });
    },
    onError: (err) => setError(err instanceof Error ? err.message : String(err)),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={table ? `New plan for ${table.name}` : 'New dinner plan'}
      footer={
        <Button
          title="Create and invite"
          fullWidth
          size="lg"
          loading={create.isPending}
          disabled={!title.trim() || (!table && !invited.length)}
          onPress={() => create.mutate()}
        />
      }>
      <Input label="What's the occasion?" placeholder="Friday dinner" value={title} onChangeText={setTitle} maxLength={80} />
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 3 }}>
          <Input label="Date (optional)" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />
        </View>
        <View style={{ flex: 2 }}>
          <Input label="Time" placeholder="19:00" value={time} onChangeText={setTime} />
        </View>
      </View>
      {table && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <AvatarStack people={table.members} max={5} />
          <Text variant="caption" tone="muted" style={{ flex: 1 }}>
            Everyone at {table.name} is invited.
          </Text>
        </View>
      )}
      <View style={{ gap: space[2] }}>
        <Text variant="label">{table ? 'Invite more friends (optional)' : 'Invite friends'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {invited.map((f) => (
            <Chip key={f.id} label={f.displayName} icon="close" tone="accent" accessibilityLabel={`Remove ${f.displayName}`} onPress={() => setInvited(invited.filter((x) => x.id !== f.id))} />
          ))}
          <Chip label="Add friends" icon="person-add" onPress={() => setPicking(true)} />
        </View>
      </View>
      {error && (
        <Text tone="danger" role="alert">
          {create.error instanceof ApiError ? create.error.message : error}
        </Text>
      )}
      <FriendPicker
        visible={picking}
        title="Invite to this plan"
        actionLabel={(f) => `Invite ${f.displayName}`}
        friends={(friends.data ?? []).filter((f) => !invited.some((i) => i.id === f.id) && !table?.members.some((m) => m.id === f.id))}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setInvited([...invited, f as Friend]);
          setPicking(false);
        }}
      />
    </Sheet>
  );
}

/** Restaurant page / map: add this restaurant to one of your open plans. */
export function AddToPlanSheet({ restaurant, onClose }: { restaurant: { id: string; name: string }; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const plans = useQuery({ queryKey: qk.plans, queryFn: api.plans });
  const open = (plans.data ?? []).filter((p) => p.status === 'open');
  const add = useMutation({
    mutationFn: (planId: string) => api.addPlanOption(planId, { restaurantId: restaurant.id }),
    onSuccess: (_, planId) => {
      queryClient.invalidateQueries({ queryKey: qk.plan(planId) });
      queryClient.invalidateQueries({ queryKey: qk.plans });
      toast(`Added ${restaurant.name} to the plan`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't add it.", 'danger'),
  });
  return (
    <Sheet visible onClose={onClose} title={`Add ${restaurant.name} to a plan`}>
      {open.length ? (
        open.map((p) => (
          <Card key={p.id} onPress={() => add.mutate(p.id)} accessibilityLabel={`Add to ${p.title}`} style={{ gap: 2 }}>
            <Text variant="bodyStrong">{p.title}</Text>
            <Text variant="caption" tone="muted">
              {formatWhen(p.startsAt)} · {p.members.length} people
            </Text>
          </Card>
        ))
      ) : (
        <Text tone="muted">No open plans. Start one from the Friends tab.</Text>
      )}
    </Sheet>
  );
}
