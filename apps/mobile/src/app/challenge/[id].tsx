import { Button, Card, Icon, RankedBars, space, Text, useToast } from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { daysLeft, unit } from '@/components/challenges';
import { AvatarStack } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function ChallengeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const toast = useToast();
  const queryClient = useQueryClient();
  const challenge = useQuery({ queryKey: qk.challenge(id), queryFn: () => api.challenge(id) });
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.challenge(id) });
    queryClient.invalidateQueries({ queryKey: qk.challenges });
  };
  const onError = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'danger');
  const join = useMutation({
    mutationFn: () => api.joinChallenge(id),
    onSuccess: () => {
      refresh();
      toast('You’re in. Good luck!', 'success');
    },
    onError,
  });
  const leave = useMutation({
    mutationFn: () => api.leaveChallenge(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.challenges });
      router.back();
    },
    onError,
  });

  if (challenge.isPending) {
    return (
      <Screen header>
        <LoadingCards count={2} />
      </Screen>
    );
  }
  if (challenge.isError) {
    return (
      <Screen header>
        <ErrorState error={challenge.error} onRetry={() => challenge.refetch()} />
      </Screen>
    );
  }
  const c = challenge.data;
  const left = daysLeft(c.endsOn);
  const leader = c.leaderboard[0];
  const mine = c.leaderboard.find((s) => s.user.id === me.id);

  return (
    <Screen header documentTitle={c.title}>
      <Stack.Screen options={{ title: c.title }} />
      <View style={{ gap: space[1] }}>
        <Text variant="display">{c.title}</Text>
        <Text tone="muted">
          First to {c.target} {unit(c.metric, c.target)} · {fmt(c.startsOn)}–{fmt(c.endsOn)} ·{' '}
          {c.ended ? 'finished' : `${left} day${left === 1 ? '' : 's'} left`}
        </Text>
        <Text variant="caption" tone="muted">
          Started by {c.isCreator ? 'you' : c.creator.displayName}. Only visits that aren’t private count.
        </Text>
      </View>

      {c.ended && leader && leader.count > 0 && (
        <Card style={{ gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon name="medal" color="primary" />
            <Text variant="heading">{leader.user.id === me.id ? 'You won' : `${leader.user.displayName} won`}</Text>
          </View>
          <Text tone="muted">
            {leader.count} {unit(c.metric, leader.count)}
          </Text>
        </Card>
      )}

      {c.status === 'invited' && !c.ended ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button title="Join challenge" icon="flag" loading={join.isPending} onPress={() => join.mutate()} />
          <Button title="No thanks" variant="ghost" loading={leave.isPending} onPress={() => leave.mutate()} />
        </View>
      ) : (
        mine && (
          <Text variant="subheading">
            You: {mine.count} of {c.target}
            {mine.completed ? ' · target reached' : ''}
          </Text>
        )
      )}

      <Section title="Leaderboard">
        {c.leaderboard.length ? (
          <RankedBars items={c.leaderboard.map((s) => ({ label: s.user.id === me.id ? `${s.user.displayName} (you)` : s.user.displayName, value: s.count }))} unit={unit(c.metric, 2)} max={c.target} />
        ) : (
          <Text tone="muted">Nobody has joined yet.</Text>
        )}
      </Section>

      {c.invited.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <AvatarStack people={c.invited} />
          <Text variant="caption" tone="muted">
            {c.invited.length} invited, not joined yet
          </Text>
        </View>
      )}

      {c.status === 'joined' && !c.isCreator && !c.ended && (
        <Button title="Leave challenge" variant="ghost" size="sm" loading={leave.isPending} onPress={() => leave.mutate()} style={{ alignSelf: 'flex-start' }} />
      )}
    </Screen>
  );
}
