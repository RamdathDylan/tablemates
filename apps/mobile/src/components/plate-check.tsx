import type { PlatePost } from '@tablemates/shared';
import { Button, Card, Chip, Icon, radius, space, Text, timeAgo, useTheme, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { pickPhotos, uploadPhoto } from '@/lib/uploads';

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Feed card for today's plate check: waiting → countdown to post → friends' plates. */
export function PlateCheckCard() {
  const { colors } = useTheme();
  const toast = useToast();
  const queryClient = useQueryClient();
  const today = useQuery({ queryKey: qk.plates, queryFn: api.platesToday, refetchInterval: 60_000 });
  const data = today.data;
  const open = !!data?.prompt && !data.mine;
  const now = useNow(open);

  const post = useMutation({
    mutationFn: async (camera: boolean) => {
      const [photo] = await pickPhotos({ limit: 1, camera });
      if (!photo) return null;
      const uploaded = await uploadPhoto(photo, 'plate');
      return api.postPlate(uploaded.id);
    },
    onSuccess: (res) => {
      if (!res) return;
      queryClient.invalidateQueries({ queryKey: qk.plates });
      toast('Plate shared', 'success');
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Couldn't share your plate.", 'danger'),
  });

  if (!data) return null;
  // Before today's moment there's nothing to show; the push alert is the surprise.
  if (!data.prompt) return null;

  if (!data.mine) {
    const left = new Date(data.prompt.onTimeUntil).getTime() - now;
    const onTime = left > 0;
    const mm = Math.floor(Math.max(0, left) / 60_000);
    const ss = Math.floor((Math.max(0, left) % 60_000) / 1000);
    return (
      <Card style={{ gap: space[3], borderColor: colors.primary, borderWidth: 2 }} role="region" aria-label="Plate check">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Icon name="camera" color="primary" />
          <Text variant="heading" style={{ flex: 1 }}>
            Plate check!
          </Text>
          <Chip
            label={onTime ? `${mm}:${String(ss).padStart(2, '0')}` : 'Late'}
            icon="time"
            tone={onTime ? 'primary' : 'neutral'}
            accessibilityLabel={onTime ? `${mm} minutes ${ss} seconds left to be on time` : 'You can still post, marked late'}
          />
        </View>
        <Text tone="muted">
          Show friends what’s on your plate right now.
          {data.friendsPosted ? ` ${data.friendsPosted} friend${data.friendsPosted === 1 ? ' has' : 's have'} posted. Share yours to see theirs.` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button title="Take photo" icon="camera" loading={post.isPending} onPress={() => post.mutate(true)} />
          <Button title="Choose photo" variant="secondary" disabled={post.isPending} onPress={() => post.mutate(false)} />
        </View>
      </Card>
    );
  }

  const all: PlatePost[] = [data.mine, ...data.posts];
  return (
    <Card style={{ gap: space[3] }} role="region" aria-label="Today's plates">
      <Text variant="overline" tone="muted" role="heading">
        Today’s plates
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {all.map((p) => (
          <View key={p.user.id} style={{ width: 100, gap: 2 }}>
            <Image
              source={{ uri: p.photo.url }}
              accessibilityLabel={`${p.user.displayName}'s plate${p.late ? ', posted late' : ''}`}
              style={{ width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceSunken }}
            />
            <Text variant="caption" numberOfLines={1}>
              {p.user.id === data.mine!.user.id ? 'You' : p.user.displayName}
            </Text>
            <Text variant="caption" tone="subtle" style={{ fontSize: 11 }}>
              {p.late ? `Late · ${timeAgo(p.postedAt)}` : timeAgo(p.postedAt)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}
