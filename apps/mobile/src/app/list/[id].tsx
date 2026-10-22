import { Button, Chip, EmptyState, IconButton, RestaurantCard, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ListSheet } from '@/components/lists';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: qk.list(id), queryFn: () => api.list(id) });
  const [editing, setEditing] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.list(id) });
    queryClient.invalidateQueries({ queryKey: ['lists'] });
  };
  const onError = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'danger');
  const follow = useMutation({
    mutationFn: (following: boolean) => (following ? api.unfollowList(id) : api.followList(id)),
    onSuccess: refresh,
    onError,
  });
  const saveAll = useMutation({
    mutationFn: () => api.saveAllFromList(id),
    onSuccess: ({ added }) => {
      refresh();
      queryClient.invalidateQueries({ queryKey: qk.saved });
      toast(added ? `Saved ${added} place${added === 1 ? '' : 's'} to Want to try` : 'Already on your list', 'success');
    },
    onError,
  });
  const remove = useMutation({ mutationFn: (restaurantId: string) => api.removeFromList(id, restaurantId), onSuccess: refresh, onError });
  const del = useMutation({
    mutationFn: () => api.deleteList(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      router.back();
    },
    onError,
  });

  if (list.isPending) {
    return (
      <Screen header>
        <LoadingCards count={2} />
      </Screen>
    );
  }
  if (list.isError) {
    return (
      <Screen header>
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      </Screen>
    );
  }
  const l = list.data;

  return (
    <Screen header documentTitle={l.title}>
      <Stack.Screen options={{ title: l.title }} />
      <View style={{ gap: space[2] }}>
        <Text variant="display">{l.title}</Text>
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap', alignItems: 'center' }}>
          {l.table ? (
            <Chip
              label={`${l.table.emoji} ${l.table.name}`}
              accessibilityLabel={`Shared with ${l.table.name}. Open the table`}
              onPress={() => router.push({ pathname: '/table/[id]', params: { id: l.table!.id } })}
            />
          ) : (
            <Chip label={l.audience === 'private' ? 'Only you' : 'Friends'} icon={l.audience === 'private' ? 'lock-closed' : 'people'} />
          )}
          <Text variant="caption" tone="muted">
            {l.isOwner ? 'Your list' : `By ${l.owner.displayName}`} · {l.itemCount} place{l.itemCount === 1 ? '' : 's'}
          </Text>
        </View>
        {!!l.description && <Text>{l.description}</Text>}
      </View>

      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        {l.isOwner ? (
          <>
            <Button title="Edit" icon="create-outline" variant="secondary" size="sm" onPress={() => setEditing(true)} />
            <Button
              title="View on map"
              icon="map-outline"
              variant="secondary"
              size="sm"
              onPress={() => router.navigate({ pathname: '/map', params: { list: l.id } })}
            />
            <Button title="Delete list" variant="ghost" size="sm" onPress={() => del.mutate()} />
          </>
        ) : l.table ? (
          <>
            <Button title="Save all to Want to try" icon="bookmark-outline" variant="secondary" size="sm" loading={saveAll.isPending} onPress={() => saveAll.mutate()} />
            <Button
              title="View on map"
              icon="map-outline"
              variant="ghost"
              size="sm"
              onPress={() => router.navigate({ pathname: '/map', params: { list: l.id } })}
            />
          </>
        ) : (
          <>
            <Button
              title={l.following ? 'Following' : 'Follow'}
              icon={l.following ? 'checkmark' : 'add'}
              variant={l.following ? 'secondary' : 'primary'}
              size="sm"
              aria-pressed={l.following}
              onPress={() => follow.mutate(l.following)}
            />
            <Button title="Save all to Want to try" icon="bookmark-outline" variant="secondary" size="sm" loading={saveAll.isPending} onPress={() => saveAll.mutate()} />
            <Button
              title="View on map"
              icon="map-outline"
              variant="ghost"
              size="sm"
              onPress={() => router.navigate({ pathname: '/map', params: { list: l.id } })}
            />
          </>
        )}
      </View>

      {l.items.length === 0 ? (
        <EmptyState
          icon="list"
          title="Nothing here yet"
          message={l.canEdit ? 'Add places from any restaurant page.' : `${l.owner.displayName} hasn't added anything yet.`}
        />
      ) : (
        l.items.map((item) => (
          <View key={item.restaurant.id} style={{ gap: space[1] }}>
            <RestaurantCard
              name={item.restaurant.name}
              address={item.restaurant.address}
              cuisine={item.restaurant.cuisine}
              priceLevel={item.restaurant.priceLevel}
              onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.restaurant.id } })}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[2] }}>
              {!!item.note && (
                <Text variant="caption" tone="muted" style={{ flex: 1 }}>
                  “{item.note}”
                </Text>
              )}
              {l.canEdit && (
                <IconButton
                  icon="trash-outline"
                  size="sm"
                  accessibilityLabel={`Remove ${item.restaurant.name} from this list`}
                  onPress={() => remove.mutate(item.restaurant.id)}
                />
              )}
            </View>
          </View>
        ))
      )}
      {editing && <ListSheet list={l} onClose={() => setEditing(false)} />}
    </Screen>
  );
}
