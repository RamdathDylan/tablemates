import type { Friend, TableSummary } from '@tablemates/shared';
import { Button, Chip, focusRing, Input, radius, Sheet, space, Text, useTheme, useToast, type PressState } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { FriendPicker } from './friend-picker';
import { AvatarStack } from './plans';
import { Section } from './screen';

export const TABLE_EMOJI = ['🍽️', '🌮', '🍣', '🍕', '🍜', '🥐', '🍔', '🥗', '🍷', '☕'];

/** Friends screen: the groups you're in. */
export function TablesSection() {
  const tables = useQuery({ queryKey: qk.tables, queryFn: api.tables });
  const [creating, setCreating] = useState(false);
  return (
    <Section title="Tables" action={<Button title="New table" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
      {tables.data?.length ? (
        <View style={{ gap: space[2] }}>
          {tables.data.map((t) => (
            <TableRow key={t.id} table={t} />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Start a group for the people you eat with most: a shared feed, lists, and dinner plans.
        </Text>
      )}
      {creating && <NewTableSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

export function TableEmoji({ emoji, size = 44 }: { emoji: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      aria-hidden
      style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>{emoji}</Text>
    </View>
  );
}

function TableRow({ table }: { table: TableSummary }) {
  const { colors } = useTheme();
  const people = `${table.members.length} ${table.members.length === 1 ? 'person' : 'people'}`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${table.name}, ${people}`}
      onPress={() => router.push({ pathname: '/table/[id]', params: { id: table.id } })}
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
      <TableEmoji emoji={table.emoji} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {table.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {people}
          {table.isOwner ? ' · You started it' : ''}
        </Text>
      </View>
      <AvatarStack people={table.members} max={3} />
    </Pressable>
  );
}

function NewTableSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(TABLE_EMOJI[0]!);
  const [invited, setInvited] = useState<Friend[]>([]);
  const [picking, setPicking] = useState(false);

  const create = useMutation({
    mutationFn: () => api.createTable({ name, emoji, memberIds: invited.map((f) => f.id) }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: qk.tables });
      toast(`Started ${name}`, 'success');
      onClose();
      router.push({ pathname: '/table/[id]', params: { id } });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't start the table.", 'danger'),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title="New table"
      footer={
        <Button title="Start table" fullWidth size="lg" loading={create.isPending} disabled={!name.trim() || !invited.length} onPress={() => create.mutate()} />
      }>
      <Input label="Name" placeholder="Taco Tuesday crew" value={name} onChangeText={setName} maxLength={40} />
      <View style={{ gap: space[2] }}>
        <Text variant="label">Icon</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {TABLE_EMOJI.map((e) => (
            <Chip key={e} label={e} accessibilityLabel={`Use ${e}`} selected={emoji === e} onPress={() => setEmoji(e)} />
          ))}
        </View>
      </View>
      <View style={{ gap: space[2] }}>
        <Text variant="label">Who’s at the table</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {invited.map((f) => (
            <Chip key={f.id} label={f.displayName} icon="close" tone="accent" accessibilityLabel={`Remove ${f.displayName}`} onPress={() => setInvited(invited.filter((x) => x.id !== f.id))} />
          ))}
          <Chip label="Add friends" icon="person-add" onPress={() => setPicking(true)} />
        </View>
        <Text variant="caption" tone="muted">
          Members see each other’s reviews here only if they’re already friends.
        </Text>
      </View>
      <FriendPicker
        visible={picking}
        title="Add to this table"
        actionLabel={(f) => `Add ${f.displayName}`}
        friends={(friends.data ?? []).filter((f) => !invited.some((i) => i.id === f.id))}
        onClose={() => setPicking(false)}
        onPick={(f) => {
          setInvited([...invited, f as Friend]);
          setPicking(false);
        }}
      />
    </Sheet>
  );
}
