import type { ChallengeMetric, ChallengeSummary, Friend } from '@tablemates/shared';
import { Button, Chip, focusRing, Icon, Input, radius, Sheet, space, Text, useTheme, useToast, type PressState } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api, ApiError } from '@/lib/api';
import { qk } from '@/lib/query-keys';

import { FriendPicker } from './friend-picker';
import { Section } from './screen';

export const METRIC_UNITS: Record<ChallengeMetric, [string, string]> = {
  new_places: ['new place', 'new places'],
  cuisines: ['cuisine', 'cuisines'],
  visits: ['visit', 'visits'],
  reviews: ['review', 'reviews'],
};
export const unit = (metric: ChallengeMetric, n: number) => METRIC_UNITS[metric][n === 1 ? 0 : 1];

const iso = (d: Date) => d.toLocaleDateString('en-CA');
const addDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const endOfMonth = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

/** Starting points; dates are worked out when picked. */
const TEMPLATES: { title: string; metric: ChallengeMetric; target: number; ends: () => string }[] = [
  { title: '3 new cuisines this month', metric: 'cuisines', target: 3, ends: endOfMonth },
  { title: '5 new places this month', metric: 'new_places', target: 5, ends: endOfMonth },
  { title: '8 meals out in 30 days', metric: 'visits', target: 8, ends: () => addDays(29) },
  { title: '4 reviews in 2 weeks', metric: 'reviews', target: 4, ends: () => addDays(13) },
];

export function daysLeft(endsOn: string) {
  const end = new Date(`${endsOn}T23:59:59`);
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86_400_000));
}

/** Friends screen: your challenges and a button to start one. */
export function ChallengesSection() {
  const challenges = useQuery({ queryKey: qk.challenges, queryFn: api.challenges });
  const [creating, setCreating] = useState(false);
  return (
    <Section title="Challenges" action={<Button title="New challenge" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
      {challenges.data?.length ? (
        <View style={{ gap: space[2] }}>
          {challenges.data.map((c) => (
            <ChallengeRow key={c.id} challenge={c} />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Race your friends to try new places, cuisines, or just eat out more.
        </Text>
      )}
      {creating && <NewChallengeSheet onClose={() => setCreating(false)} />}
    </Section>
  );
}

function ChallengeRow({ challenge: c }: { challenge: ChallengeSummary }) {
  const { colors } = useTheme();
  const status = c.ended
    ? 'Finished'
    : c.status === 'invited'
      ? 'Invited · tap to join'
      : `${c.mine} of ${c.target} ${unit(c.metric, c.target)} · ${daysLeft(c.endsOn)} days left`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={`${c.title}, ${status}`}
      onPress={() => router.push({ pathname: '/challenge/[id]', params: { id: c.id } })}
      style={(state: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          padding: space[3],
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: c.status === 'invited' && !c.ended ? colors.primary : colors.border,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : colors.surface,
        },
        focusRing(state, colors),
      ]}>
      <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={c.ended ? 'medal' : 'flag'} color="onAccentSoft" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {c.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {status}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color="textSubtle" />
    </Pressable>
  );
}

function NewChallengeSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const [template, setTemplate] = useState(0);
  const [title, setTitle] = useState(TEMPLATES[0]!.title);
  const [invited, setInvited] = useState<Friend[]>([]);
  const [picking, setPicking] = useState(false);
  const t = TEMPLATES[template]!;

  const create = useMutation({
    mutationFn: () =>
      api.createChallenge({ title, metric: t.metric, target: t.target, startsOn: iso(new Date()), endsOn: t.ends(), memberIds: invited.map((f) => f.id) }),
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: qk.challenges });
      toast(`Challenged ${invited.length} friend${invited.length === 1 ? '' : 's'}`, 'success');
      onClose();
      router.push({ pathname: '/challenge/[id]', params: { id } });
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't start the challenge.", 'danger'),
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      title="New challenge"
      footer={<Button title="Start challenge" fullWidth size="lg" loading={create.isPending} disabled={!title.trim() || !invited.length} onPress={() => create.mutate()} />}>
      <View style={{ gap: space[2] }}>
        <Text variant="label">Pick a challenge</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {TEMPLATES.map((x, i) => (
            <Chip
              key={x.title}
              label={x.title}
              selected={template === i}
              onPress={() => {
                setTemplate(i);
                setTitle(x.title);
              }}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted">
          Ends {new Date(`${t.ends()}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}. Only visits you share count.
        </Text>
      </View>
      <Input label="Name" value={title} onChangeText={setTitle} maxLength={60} />
      <View style={{ gap: space[2] }}>
        <Text variant="label">Challenge friends</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {invited.map((f) => (
            <Chip key={f.id} label={f.displayName} icon="close" tone="accent" accessibilityLabel={`Remove ${f.displayName}`} onPress={() => setInvited(invited.filter((x) => x.id !== f.id))} />
          ))}
          <Chip label="Add friends" icon="person-add" onPress={() => setPicking(true)} />
        </View>
      </View>
      <FriendPicker
        visible={picking}
        title="Challenge a friend"
        actionLabel={(f) => `Challenge ${f.displayName}`}
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
