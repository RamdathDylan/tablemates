import type { Favorite } from '@tablemates/shared';
import { Button, Chip, focusRing, Icon, IconButton, radius, Sheet, space, Text, useTheme, useToast, type PressState } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

/** Four pinned favorites under a profile header (Letterboxd-style). Empty slots invite you to fill them on your own profile. */
export function FavoritesRow({ favorites, own, username }: { favorites: Favorite[]; own: boolean; username: string }) {
  const [editing, setEditing] = useState(false);
  if (!own && !favorites.length) return null;
  const slots = Array.from({ length: 4 }, (_, i) => favorites[i] ?? null);
  return (
    <View style={{ gap: space[2] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="overline" tone="muted" role="heading">
          Favorites
        </Text>
        {own && <Button title={favorites.length ? 'Edit' : 'Pick favorites'} size="sm" variant="ghost" onPress={() => setEditing(true)} />}
      </View>
      <View role="list" style={{ flexDirection: 'row', gap: space[2] }}>
        {slots.map((f, i) => (
          <FavoriteTile key={f?.restaurant.id ?? `empty-${i}`} favorite={f} rank={i + 1} onAdd={own ? () => setEditing(true) : undefined} />
        ))}
      </View>
      {editing && <FavoritesSheet current={favorites} username={username} onClose={() => setEditing(false)} />}
    </View>
  );
}

function FavoriteTile({ favorite, rank, onAdd }: { favorite: Favorite | null; rank: number; onAdd?: () => void }) {
  const { colors } = useTheme();
  if (!favorite) {
    if (!onAdd) return <View style={{ flex: 1 }} />;
    return (
      <Pressable
        role="button"
        accessibilityLabel={`Add favorite number ${rank}`}
        onPress={onAdd}
        style={(state: PressState) => [
          { flex: 1, aspectRatio: 1, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderInput, alignItems: 'center', justifyContent: 'center' },
          focusRing(state, colors),
        ]}>
        <Icon name="add" color="textSubtle" />
      </Pressable>
    );
  }
  const r = favorite.restaurant;
  return (
    <Pressable
      role="listitem"
      accessibilityLabel={`Favorite ${rank}: ${r.name}`}
      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
      style={(state: PressState) => [{ flex: 1, gap: space[1], borderRadius: radius.md }, focusRing(state, colors)]}>
      <View style={{ aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        {favorite.photo ? (
          <Image source={{ uri: favorite.photo.url }} style={{ width: '100%', height: '100%' }} />
        ) : (
          <Icon name="restaurant" color="onPrimarySoft" />
        )}
      </View>
      <Text variant="caption" numberOfLines={2} style={{ fontSize: 12, lineHeight: 15 }}>
        {r.name}
      </Text>
    </Pressable>
  );
}

/** Choose up to four places you've visited and put them in order. */
function FavoritesSheet({ current, username, onClose }: { current: Favorite[]; username: string; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const visits = useQuery({ queryKey: qk.myVisits, queryFn: api.myVisits });
  const places = [...new Map((visits.data ?? []).map((v) => [v.restaurant.id, v.restaurant])).values()];
  const [picked, setPicked] = useState(current.map((f) => ({ id: f.restaurant.id, name: f.restaurant.name })));
  const save = useMutation({
    mutationFn: () => api.setFavorites(picked.map((p) => p.id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.profile(username) });
      toast('Favorites updated', 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't save favorites.", 'danger'),
  });
  const move = (i: number, d: number) => {
    const next = [...picked];
    [next[i], next[i + d]] = [next[i + d]!, next[i]!];
    setPicked(next);
  };

  return (
    <Sheet visible onClose={onClose} title="Your top 4" footer={<Button title="Save" fullWidth size="lg" loading={save.isPending} onPress={() => save.mutate()} />}>
      {picked.map((p, i) => (
        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="heading" tone="primary" style={{ width: 24 }}>
            {i + 1}
          </Text>
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {p.name}
          </Text>
          <IconButton icon="arrow-up" size="sm" accessibilityLabel={`Move ${p.name} up`} disabled={i === 0} onPress={() => move(i, -1)} />
          <IconButton icon="arrow-down" size="sm" accessibilityLabel={`Move ${p.name} down`} disabled={i === picked.length - 1} onPress={() => move(i, 1)} />
          <IconButton icon="close" size="sm" accessibilityLabel={`Unpin ${p.name}`} onPress={() => setPicked(picked.filter((x) => x.id !== p.id))} />
        </View>
      ))}
      <Text variant="overline" tone="muted">
        {picked.length < 4 ? `Places you've been · pick ${4 - picked.length} more` : 'All four picked'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {places
          .filter((r) => !picked.some((p) => p.id === r.id))
          .map((r) => (
            <Chip key={r.id} label={r.name} onPress={() => picked.length < 4 && setPicked([...picked, { id: r.id, name: r.name }])} />
          ))}
      </View>
    </Sheet>
  );
}
