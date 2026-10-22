import { Button, EmptyState } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';

import { UserListsSection } from '@/components/lists';
import { ProfileHeader } from '@/components/profile-header';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { VisitList } from '@/components/visit-list';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useFriendActions } from '@/lib/use-friend-actions';

export default function UserScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const actions = useFriendActions();
  const profile = useQuery({ queryKey: qk.profile(username), queryFn: () => api.profile(username) });
  const canSee = profile.data?.friendship === 'friends' || profile.data?.friendship === 'self';
  const visits = useQuery({
    queryKey: qk.userVisits(username),
    queryFn: () => api.userVisits(username),
    enabled: canSee,
  });

  if (profile.isPending) {
    return (
      <Screen header>
        <LoadingCards count={1} />
      </Screen>
    );
  }
  if (profile.isError) {
    return (
      <Screen header>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    );
  }

  const p = profile.data;
  const busy = actions.add.isPending || actions.accept.isPending || actions.decline.isPending || actions.remove.isPending;
  const friendAction =
    p.friendship === 'none' ? (
      <Button title="Add friend" icon="person-add" onPress={() => actions.add.mutate(p.username)} loading={busy} />
    ) : p.friendship === 'incoming' ? (
      <>
        <Button title="Decline" variant="secondary" onPress={() => p.requestId && actions.decline.mutate(p.requestId)} disabled={busy} />
        <Button title="Accept request" onPress={() => p.requestId && actions.accept.mutate(p.requestId)} loading={busy} />
      </>
    ) : p.friendship === 'outgoing' ? (
      <Button title="Cancel request" variant="secondary" onPress={() => p.requestId && actions.decline.mutate(p.requestId)} loading={busy} />
    ) : p.friendship === 'friends' ? (
      <Button title="Remove friend" variant="ghost" size="sm" onPress={() => actions.remove.mutate(p.id)} loading={busy} />
    ) : null;

  return (
    <Screen header documentTitle={p.displayName}>
      <Stack.Screen options={{ title: `@${p.username}` }} />
      <ProfileHeader profile={p} actions={friendAction} />
      {canSee && <UserListsSection username={p.username} />}
      {canSee ? (
        <Section title="Visits">
          {visits.isPending ? (
            <LoadingCards count={1} />
          ) : visits.isError ? (
            <ErrorState error={visits.error} onRetry={() => visits.refetch()} />
          ) : visits.data.length === 0 ? (
            <EmptyState icon="restaurant-outline" title="No visits yet" message={`${p.displayName} hasn't logged anywhere yet.`} />
          ) : (
            <VisitList visits={visits.data} />
          )}
        </Section>
      ) : (
        <EmptyState
          icon="lock-closed-outline"
          title="Friends only"
          message={`Add ${p.displayName} as a friend to see where they eat and what they recommend.`}
        />
      )}
    </Screen>
  );
}
