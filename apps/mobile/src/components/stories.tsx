import { storyReactions, type StoryGroup } from '@tablemates/shared';
import {
  Avatar,
  Button,
  Chip,
  focusRing,
  Icon,
  IconButton,
  Input,
  palette,
  radius,
  Sheet,
  space,
  Text,
  timeAgo,
  useReducedMotion,
  useTheme,
  useToast,
  type PressState,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';
import { pickPhotos, uploadPhoto, type LocalPhoto } from '@/lib/uploads';

import { PlacePicker, type PickedPlace } from './place-picker';

const STORY_MS = 5000;

/** Feed header: your story first, then friends' rings (colored = unseen). */
export function StoriesRow() {
  const me = useMe();
  const stories = useQuery({ queryKey: qk.stories, queryFn: api.stories, refetchInterval: 60_000 });
  const [open, setOpen] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const groups = stories.data ?? [];
  const mineIndex = groups.findIndex((g) => g.isMine);

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[3], paddingRight: space[4] }}>
        <Ring
          name="Your story"
          avatar={{ name: me.displayName, uri: me.avatarUrl }}
          state={mineIndex >= 0 ? 'seen' : 'add'}
          label={mineIndex >= 0 ? 'View your story' : 'Add to your story'}
          onPress={() => (mineIndex >= 0 ? setOpen(mineIndex) : setComposing(true))}
        />
        {mineIndex >= 0 && (
          <Ring name="Add" icon="add" state="add" label="Add another story" onPress={() => setComposing(true)} />
        )}
        {groups.map((g, i) =>
          g.isMine ? null : (
            <Ring
              key={g.author.id}
              name={g.author.displayName.split(' ')[0]!}
              avatar={{ name: g.author.displayName, uri: g.author.avatarUrl }}
              state={g.allSeen ? 'seen' : 'new'}
              label={`${g.author.displayName}'s story${g.allSeen ? '' : ', new'}`}
              onPress={() => setOpen(i)}
            />
          ),
        )}
      </ScrollView>
      {open !== null && groups[open] && <StoryViewer groups={groups} start={open} onClose={() => setOpen(null)} />}
      {composing && <StoryComposer onClose={() => setComposing(false)} />}
    </View>
  );
}

function Ring({
  name,
  avatar,
  icon,
  state,
  label,
  onPress,
}: {
  name: string;
  avatar?: { name: string; uri: string | null };
  icon?: 'add';
  state: 'new' | 'seen' | 'add';
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(s: PressState) => [{ alignItems: 'center', gap: space[1], width: 68, borderRadius: radius.md }, focusRing(s, colors)]}>
      <View
        style={{
          padding: 2,
          borderRadius: radius.full,
          borderWidth: state === 'new' ? 3 : 2,
          borderColor: state === 'new' ? colors.primary : colors.borderStrong,
          borderStyle: state === 'add' ? 'dashed' : 'solid',
        }}>
        {avatar ? (
          <Avatar name={avatar.name} uri={avatar.uri} size="lg" decorative />
        ) : (
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken }}>
            <Icon name={icon ?? 'add'} color="textMuted" />
          </View>
        )}
      </View>
      <Text variant="caption" numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  );
}

/** Full-screen player: auto-advances (unless reduced motion), with Previous/Next buttons for everyone. */
function StoryViewer({ groups, start, onClose }: { groups: StoryGroup[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [g, setG] = useState(start);
  const [s, setS] = useState(() => Math.max(0, groups[start]!.stories.findIndex((x) => !x.seen)));
  const [viewers, setViewers] = useState(false);
  const group = groups[g]!;
  const story = group.stories[s]!;

  const next = () => {
    if (s < group.stories.length - 1) setS(s + 1);
    else if (g < groups.length - 1) {
      setG(g + 1);
      setS(0);
    } else onClose();
  };
  const prev = () => {
    if (s > 0) setS(s - 1);
    else if (g > 0) {
      setG(g - 1);
      setS(groups[g - 1]!.stories.length - 1);
    }
  };

  useEffect(() => {
    if (!group.isMine && !story.seen) api.viewStory(story.id).then(() => queryClient.invalidateQueries({ queryKey: qk.stories }));
    if (reduced || viewers) return;
    const t = setTimeout(next, STORY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id, reduced, viewers]);

  const remove = async () => {
    await api.deleteStory(story.id);
    await queryClient.invalidateQueries({ queryKey: qk.stories });
    toast('Story deleted');
    onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View role="dialog" aria-modal aria-label={`Story ${s + 1} of ${group.stories.length} from ${group.author.displayName}`} style={styles.root}>
        <View style={styles.progress} aria-hidden>
          {group.stories.map((x, i) => (
            <View key={x.id} style={[styles.segment, { backgroundColor: i <= s ? palette.stone[0] : 'rgba(255,255,255,0.35)' }]} />
          ))}
        </View>
        <View style={styles.header}>
          <Avatar name={group.author.displayName} uri={group.author.avatarUrl} size="sm" decorative />
          <Text variant="label" style={{ color: palette.stone[0], flex: 1 }}>
            {group.isMine ? 'Your story' : group.author.displayName} · {timeAgo(story.createdAt)}
            {story.audience === 'close_friends' ? ' · ★ Close friends' : ''}
          </Text>
          <IconButton icon="close" variant="secondary" accessibilityLabel="Close stories" onPress={onClose} />
        </View>

        <Image source={{ uri: story.photo.url }} resizeMode="contain" accessibilityLabel={story.caption || `Photo from ${group.author.displayName}`} style={{ width: Math.min(width, 720), height: height * 0.66 }} />

        <View style={styles.footer}>
          {story.restaurant && (
            // Chip aligns itself to the start; the wrapper centers it with the caption.
            <View style={{ alignSelf: 'center' }}>
            <Chip
              label={story.restaurant.name}
              icon="restaurant"
              onPress={() => {
                onClose();
                router.push({ pathname: '/restaurant/[id]', params: { id: story.restaurant!.id } });
              }}
            />
            </View>
          )}
          {!!story.caption && (
            <Text variant="subheading" align="center" style={{ color: palette.stone[0] }}>
              {story.caption}
            </Text>
          )}
          {group.isMine ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button title="Seen by" icon="eye-outline" variant="secondary" size="sm" onPress={() => setViewers(true)} />
              <Button title="Delete" icon="trash-outline" variant="secondary" size="sm" onPress={remove} />
            </View>
          ) : (
            <View role="group" accessibilityLabel="React" style={{ flexDirection: 'row', gap: space[2] }}>
              {storyReactions.map((emoji) => (
                <Button
                  key={emoji}
                  title={emoji}
                  variant="secondary"
                  size="sm"
                  accessibilityLabel={`React ${emoji}`}
                  onPress={() =>
                    api
                      .reactToStory(story.id, emoji)
                      .then(() => toast(`Sent ${emoji}`))
                      .catch((err) => toast(err instanceof ApiError ? err.message : "Couldn't send.", 'danger'))
                  }
                />
              ))}
            </View>
          )}
        </View>

        <View style={[styles.nav, { left: space[2] }]}>
          <IconButton icon="chevron-back" variant="secondary" size="lg" accessibilityLabel="Previous story" disabled={g === 0 && s === 0} onPress={prev} />
        </View>
        <View style={[styles.nav, { right: space[2] }]}>
          <IconButton icon="chevron-forward" variant="secondary" size="lg" accessibilityLabel="Next story" onPress={next} />
        </View>
        {viewers && <ViewersSheet storyId={story.id} onClose={() => setViewers(false)} />}
      </View>
    </Modal>
  );
}

function ViewersSheet({ storyId, onClose }: { storyId: string; onClose: () => void }) {
  const viewers = useQuery({ queryKey: ['storyViewers', storyId], queryFn: () => api.storyViewers(storyId) });
  return (
    <Sheet visible onClose={onClose} title={`Seen by ${viewers.data?.length ?? '…'}`}>
      {viewers.data?.length === 0 && <Text tone="muted">No one yet.</Text>}
      {viewers.data?.map((v) => (
        <View key={v.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Avatar name={v.user.displayName} uri={v.user.avatarUrl} size="sm" decorative />
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {v.user.displayName}
          </Text>
          <Text variant="caption" tone="muted">
            {timeAgo(v.viewedAt)}
          </Text>
        </View>
      ))}
    </Sheet>
  );
}

function StoryComposer({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [photo, setPhoto] = useState<LocalPhoto | null>(null);
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [tagging, setTagging] = useState(false);
  const [caption, setCaption] = useState('');
  const [audience, setAudience] = useState<'friends' | 'close_friends'>('friends');
  const share = useMutation({
    mutationFn: async () => {
      const uploaded = await uploadPhoto(photo!, 'story');
      return api.postStory({ photoId: uploaded.id, restaurantId: place?.restaurantId, googlePlaceId: place?.googlePlaceId, caption, audience });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.stories });
      toast('Added to your story', 'success');
      onClose();
    },
    onError: (err) => toast(err instanceof Error ? err.message : "Couldn't share.", 'danger'),
  });
  const choose = async (camera: boolean) => {
    const [p] = await pickPhotos({ limit: 1, camera });
    if (p) setPhoto(p);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Add to your story"
      footer={<Button title="Share for 24 hours" fullWidth size="lg" disabled={!photo} loading={share.isPending} onPress={() => share.mutate()} />}>
      {photo ? (
        <View style={{ gap: space[2] }}>
          <Image source={{ uri: photo.uri }} accessibilityLabel="Selected photo" style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg }} resizeMode="cover" />
          <Button title="Choose a different photo" variant="ghost" size="sm" onPress={() => choose(false)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button title="Choose photo" icon="images-outline" variant="secondary" onPress={() => choose(false)} />
          <Button title="Take photo" icon="camera-outline" variant="secondary" onPress={() => choose(true)} />
        </View>
      )}
      <Input label="Caption (optional)" value={caption} onChangeText={setCaption} maxLength={140} placeholder="Dinner with the crew" />
      {tagging ? (
        <PlacePicker value={place} onChange={setPlace} />
      ) : (
        <Button title={place ? `At ${place.name}` : 'Tag a restaurant'} icon="restaurant-outline" variant="ghost" size="sm" onPress={() => setTagging(true)} />
      )}
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Chip label="Friends" icon="people" selected={audience === 'friends'} onPress={() => setAudience('friends')} />
        <Chip label="Close friends" icon="star" selected={audience === 'close_friends'} onPress={() => setAudience('close_friends')} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.stone[950], alignItems: 'center', justifyContent: 'center' },
  progress: { position: 'absolute', top: space[4], left: space[4], right: space[4], flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 3, borderRadius: 2 },
  header: { position: 'absolute', top: space[6], left: space[4], right: space[4], flexDirection: 'row', alignItems: 'center', gap: space[2] },
  footer: { position: 'absolute', bottom: space[8], left: space[4], right: space[4], alignItems: 'center', gap: space[3] },
  nav: { position: 'absolute', top: '50%', marginTop: -24 },
});
