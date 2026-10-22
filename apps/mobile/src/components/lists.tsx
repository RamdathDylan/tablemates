import type { ListSummary } from '@tablemates/shared';
import {
  Button,
  Chip,
  focusRing,
  Icon,
  Input,
  radius,
  Sheet,
  space,
  Text,
  TextArea,
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

import { Section } from './screen';

export function ListRow({ list }: { list: ListSummary }) {
  const { colors } = useTheme();
  const meta = [
    `${list.itemCount} place${list.itemCount === 1 ? '' : 's'}`,
    list.table
      ? `${list.table.emoji} ${list.table.name}`
      : list.isOwner
        ? list.audience === 'private'
          ? 'Only you'
          : 'Friends'
        : `by ${list.owner.displayName}`,
  ].join(' · ');
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${list.title}, ${meta}`}
      onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
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
        style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={list.table ? 'people' : list.audience === 'private' ? 'lock-closed' : 'list'} color="onAccentSoft" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {list.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {meta}
          {list.preview.length ? ` · ${list.preview.join(', ')}` : ''}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="textSubtle" />
    </Pressable>
  );
}

/** Your profile: your lists and lists you follow. */
export function MyListsSection() {
  const lists = useQuery({ queryKey: qk.myLists, queryFn: api.myLists });
  const [creating, setCreating] = useState(false);
  const mine = lists.data?.mine ?? [];
  const following = lists.data?.following ?? [];
  return (
    <>
      <Section title="Your lists" action={<Button title="New list" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
        {mine.length ? (
          <View style={{ gap: space[2] }}>{mine.map((l) => <ListRow key={l.id} list={l} />)}</View>
        ) : (
          <Text variant="caption" tone="muted">
            Collect places for friends: “Date night”, “Best tacos”, “Out-of-town guests”.
          </Text>
        )}
      </Section>
      {following.length > 0 && (
        <Section title="Lists you follow">
          <View style={{ gap: space[2] }}>{following.map((l) => <ListRow key={l.id} list={l} />)}</View>
        </Section>
      )}
      {creating && <ListSheet onClose={() => setCreating(false)} />}
    </>
  );
}

/** A friend's profile: their shared lists. */
export function UserListsSection({ username }: { username: string }) {
  const lists = useQuery({ queryKey: qk.userLists(username), queryFn: () => api.userLists(username) });
  if (!lists.data?.length) return null;
  return (
    <Section title="Lists">
      <View style={{ gap: space[2] }}>{lists.data.map((l) => <ListRow key={l.id} list={l} />)}</View>
    </Section>
  );
}

/**
 * Create a list, or edit one when `list` is given. Optionally adds a restaurant
 * right away. With `table`, it's that Table's shared list: members see and edit it.
 */
export function ListSheet({
  list,
  addRestaurantId,
  table,
  onClose,
}: {
  list?: ListSummary;
  addRestaurantId?: string;
  table?: { id: string; name: string };
  onClose: () => void;
}) {
  const forTable = table ?? list?.table ?? undefined;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(list?.title ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [audience, setAudience] = useState<'friends' | 'private'>(list?.audience ?? 'friends');
  const save = useMutation({
    mutationFn: async () => {
      if (list) return api.updateList(list.id, forTable ? { title, description } : { title, description, audience });
      const created = await api.createList({ title, description, audience, tableId: table?.id });
      if (addRestaurantId) await api.addToList(created.id, addRestaurantId);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      if (list) queryClient.invalidateQueries({ queryKey: qk.list(list.id) });
      if (forTable) queryClient.invalidateQueries({ queryKey: qk.table(forTable.id) });
      toast(list ? 'List updated' : addRestaurantId ? `Added to ${title}` : `Created ${title}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't save the list.", 'danger'),
  });
  return (
    <Sheet
      visible
      onClose={onClose}
      title={list ? 'Edit list' : forTable ? `New list for ${forTable.name}` : 'New list'}
      footer={<Button title={list ? 'Save' : 'Create list'} fullWidth size="lg" disabled={!title.trim()} loading={save.isPending} onPress={() => save.mutate()} />}>
      <Input label="Name" placeholder="Best tacos" value={title} onChangeText={setTitle} maxLength={60} />
      <TextArea label="Description (optional)" value={description} onChangeText={setDescription} maxLength={280} placeholder="What ties these places together?" />
      {forTable ? (
        <Text variant="caption" tone="muted">
          Everyone at {forTable.name} can see this list and add places to it.
        </Text>
      ) : (
        <View style={{ gap: space[2] }}>
          <Text variant="label">Who can see it</Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Chip label="Friends" icon="people" selected={audience === 'friends'} onPress={() => setAudience('friends')} />
            <Chip label="Only me" icon="lock-closed" selected={audience === 'private'} onPress={() => setAudience('private')} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

/** Restaurant page: put this place on one of your lists. */
export function AddToListSheet({ restaurant, onClose }: { restaurant: { id: string; name: string }; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const lists = useQuery({ queryKey: qk.myLists, queryFn: api.myLists });
  const [creating, setCreating] = useState(false);
  const add = useMutation({
    mutationFn: (l: ListSummary) => api.addToList(l.id, restaurant.id),
    onSuccess: (_, l) => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      queryClient.invalidateQueries({ queryKey: qk.list(l.id) });
      toast(`Added ${restaurant.name} to ${l.title}`, 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't add it.", 'danger'),
  });
  if (creating) return <ListSheet addRestaurantId={restaurant.id} onClose={onClose} />;
  return (
    <Sheet visible onClose={onClose} title={`Add ${restaurant.name} to a list`}>
      {(lists.data?.mine ?? []).map((l) => (
        <Button key={l.id} title={l.title} icon={l.audience === 'private' ? 'lock-closed' : 'list'} variant="secondary" fullWidth onPress={() => add.mutate(l)} />
      ))}
      {(lists.data?.tables ?? []).map((l) => (
        <Button
          key={l.id}
          title={`${l.title} · ${l.table?.emoji ?? ''} ${l.table?.name ?? ''}`}
          accessibilityLabel={`${l.title}, shared with ${l.table?.name ?? 'your table'}`}
          icon="people"
          variant="secondary"
          fullWidth
          onPress={() => add.mutate(l)}
        />
      ))}
      <Button title="New list" icon="add" variant="ghost" fullWidth onPress={() => setCreating(true)} />
    </Sheet>
  );
}
