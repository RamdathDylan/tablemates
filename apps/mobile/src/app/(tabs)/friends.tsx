import { Card, Divider, EmptyState, FriendRow, Input, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, useState, type ReactNode } from 'react';

import { PlansSection } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';
import { useFriendActions } from '@/lib/use-friend-actions';

const openProfile = (username: string) => router.push({ pathname: '/user/[username]', params: { username } });

export default function FriendsScreen() {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim());

  return (
    <Screen title="Friends">
      <Input
        label="Find people"
        hideLabel
        icon="search"
        placeholder="Search by name or username"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {q ? <SearchResults q={q} /> : <FriendsAndRequests />}
    </Screen>
  );
}

function SearchResults({ q }: { q: string }) {
  const actions = useFriendActions();
  const results = useQuery({ queryKey: qk.userSearch(q), queryFn: () => api.searchUsers(q) });

  if (results.isPending) return <LoadingCards count={2} />;
  if (results.isError) return <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  if (results.data.length === 0) {
    return <EmptyState icon="person-outline" title="No one found" message={`Nobody matches "${q}" yet. Invite them!`} />;
  }
  return (
    <List>
      {results.data.map((u) => (
        <FriendRow
          key={u.id}
          user={u}
          status={u.friendship}
          onPress={() => openProfile(u.username)}
          onAdd={() => actions.add.mutate(u.username)}
          onAccept={() => u.requestId && actions.accept.mutate(u.requestId)}
          onDecline={() => u.requestId && actions.decline.mutate(u.requestId)}
          busy={
            (actions.add.isPending && actions.add.variables === u.username) ||
            (!!u.requestId && actions.accept.isPending && actions.accept.variables === u.requestId)
          }
        />
      ))}
    </List>
  );
}

function FriendsAndRequests() {
  const actions = useFriendActions();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const requests = useQuery({ queryKey: qk.friendRequests, queryFn: api.friendRequests });

  if (friends.isPending || requests.isPending) return <LoadingCards count={2} />;
  if (friends.isError) return <ErrorState error={friends.error} onRetry={() => friends.refetch()} />;
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />;

  const incoming = requests.data.filter((r) => r.direction === 'incoming');
  const outgoing = requests.data.filter((r) => r.direction === 'outgoing');

  return (
    <>
      <PlansSection />

      {incoming.length > 0 && (
        <Section title={`Requests · ${incoming.length}`}>
          <List>
            {incoming.map((r) => (
              <FriendRow
                key={r.id}
                user={r.user}
                status="incoming"
                onPress={() => openProfile(r.user.username)}
                onAccept={() => actions.accept.mutate(r.id)}
                onDecline={() => actions.decline.mutate(r.id)}
                busy={actions.accept.isPending && actions.accept.variables === r.id}
              />
            ))}
          </List>
        </Section>
      )}

      <Section title={`Your friends · ${friends.data.length}`}>
        {friends.data.length > 0 && (
          <Text variant="caption" tone="muted">
            Star close friends to share visits with just them.
          </Text>
        )}
        {friends.data.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No friends yet"
            message="Search for people above. Once they accept, their recommendations show up in your feed."
          />
        ) : (
          <List>
            {friends.data.map((u) => (
              <FriendRow
                key={u.id}
                user={u}
                status="friends"
                onPress={() => openProfile(u.username)}
                meta={u.tasteMatch !== null ? `${u.tasteMatch}% taste match` : undefined}
                closeFriend={u.closeFriend}
                busy={actions.toggleClose.isPending && actions.toggleClose.variables?.userId === u.id}
                onToggleClose={() => actions.toggleClose.mutate({ userId: u.id, close: u.closeFriend, name: u.displayName })}
              />
            ))}
          </List>
        )}
      </Section>

      {outgoing.length > 0 && (
        <Section title="Sent requests">
          <List>
            {outgoing.map((r) => (
              <FriendRow
                key={r.id}
                user={r.user}
                status="outgoing"
                onPress={() => openProfile(r.user.username)}
                onDecline={() => actions.decline.mutate(r.id)}
              />
            ))}
          </List>
          <Text variant="caption" tone="subtle">
            Tap “Requested” to cancel a request.
          </Text>
        </Section>
      )}
    </>
  );
}

function List({ children }: { children: ReactNode[] }) {
  return (
    <Card padding={3}>
      {children.map((child, i) => (
        <Fragment key={i}>
          {i > 0 && <Divider inset={12} />}
          {child}
        </Fragment>
      ))}
    </Card>
  );
}
