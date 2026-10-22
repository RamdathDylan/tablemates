import type { PublicUser, TableDetail } from '@tablemates/shared';
import { Avatar, Button, Chip, EmptyState, IconButton, PhotoViewer, ReviewCard, space, Text, useToast } from '@tablemates/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { CommentsSheet } from '@/components/comments-sheet';
import { FriendPicker } from '@/components/friend-picker';
import { ListRow, ListSheet } from '@/components/lists';
import { AvatarStack, NewPlanSheet, PlanRow } from '@/components/plans';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { TableEmoji } from '@/components/tables';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/query-keys';
import { useReaction } from '@/lib/use-engagement';
import { useSaveToggle } from '@/lib/use-save';

type Tab = 'feed' | 'lists' | 'plans' | 'people';
const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'lists', label: 'Lists' },
  { key: 'plans', label: 'Plans' },
  { key: 'people', label: 'People' },
];

export default function TableScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const table = useQuery({ queryKey: qk.table(id), queryFn: () => api.table(id) });
  const [tab, setTab] = useState<Tab>('feed');

  if (table.isPending) {
    return (
      <Screen header>
        <LoadingCards count={2} />
      </Screen>
    );
  }
  if (table.isError) {
    return (
      <Screen header>
        <ErrorState error={table.error} onRetry={() => table.refetch()} />
      </Screen>
    );
  }
  const t = table.data;
  return (
    <Screen header documentTitle={t.name}>
      <Stack.Screen options={{ title: t.name }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <TableEmoji emoji={t.emoji} size={64} />
        <View style={{ flex: 1, gap: space[1] }}>
          <Text variant="display" numberOfLines={2}>
            {t.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <AvatarStack people={t.members} max={5} />
            <Text variant="caption" tone="muted">
              {t.members.length} people
            </Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {TABS.map((x) => (
          <Chip key={x.key} label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />
        ))}
      </View>
      {tab === 'feed' && <TableFeed table={t} />}
      {tab === 'lists' && <TableLists table={t} />}
      {tab === 'plans' && <TablePlans table={t} />}
      {tab === 'people' && <TablePeople table={t} />}
    </Screen>
  );
}

function TableFeed({ table }: { table: TableDetail }) {
  const save = useSaveToggle();
  const react = useReaction();
  const [thread, setThread] = useState<{ reviewId: string; title: string } | null>(null);
  const [viewer, setViewer] = useState<{ photos: { url: string }[]; index: number } | null>(null);
  const feed = useInfiniteQuery({
    queryKey: qk.tableFeed(table.id),
    queryFn: ({ pageParam }) => api.tableFeed(table.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (feed.isPending) return <LoadingCards />;
  if (feed.isError) return <ErrorState error={feed.error} onRetry={() => feed.refetch()} />;
  const items = feed.data.pages.flatMap((p) => p.items);
  if (!items.length) {
    return (
      <EmptyState
        icon="restaurant-outline"
        title="No reviews yet"
        message="When people at this table review a place, it shows up here."
        action={{ label: 'Log a visit', onPress: () => router.navigate('/log') }}
      />
    );
  }
  return (
    <>
      <Text variant="caption" tone="muted">
        Reviews from people at this table that you can already see.
      </Text>
      {items.map((item) => (
        <ReviewCard
          key={item.review.id}
          author={item.author}
          restaurantName={item.restaurant.name}
          rating={item.review.rating}
          body={item.review.body}
          recommends={item.review.recommends}
          dishes={item.review.dishes}
          visitedAt={item.visitedAt}
          onPressAuthor={() => router.push({ pathname: '/user/[username]', params: { username: item.author.username } })}
          onPressRestaurant={() => router.push({ pathname: '/restaurant/[id]', params: { id: item.restaurant.id } })}
          saved={item.saved}
          onToggleSave={() => save.mutate({ restaurantId: item.restaurant.id, saved: item.saved, name: item.restaurant.name })}
          companions={item.companions.map((c) => c.displayName)}
          photos={item.review.photos}
          onOpenPhoto={(index) => setViewer({ photos: item.review.photos, index })}
          engagement={item.engagement}
          onReact={(kind) => react.mutate({ reviewId: item.review.id, kind, on: item.engagement.mine.includes(kind) })}
          onOpenComments={() => setThread({ reviewId: item.review.id, title: `${item.author.displayName} at ${item.restaurant.name}` })}
        />
      ))}
      {feed.hasNextPage && (
        <Button title="Load more" variant="secondary" onPress={() => feed.fetchNextPage()} loading={feed.isFetchingNextPage} style={{ alignSelf: 'center' }} />
      )}
      <PhotoViewer
        photos={viewer?.photos ?? []}
        index={viewer?.index ?? null}
        onChange={(index) => setViewer(index === null || !viewer ? null : { ...viewer, index })}
      />
      {thread && <CommentsSheet reviewId={thread.reviewId} title={thread.title} onClose={() => setThread(null)} />}
    </>
  );
}

function TableLists({ table }: { table: TableDetail }) {
  const [creating, setCreating] = useState(false);
  return (
    <Section title="Shared lists" action={<Button title="New list" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
      {table.lists.length ? (
        <View style={{ gap: space[2] }}>
          {table.lists.map((l) => (
            <ListRow key={l.id} list={l} />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Make a list everyone here can add to, like “Next group dinner” or “Birthday spots”.
        </Text>
      )}
      {creating && <ListSheet table={table} onClose={() => setCreating(false)} />}
    </Section>
  );
}

function TablePlans({ table }: { table: TableDetail }) {
  const [creating, setCreating] = useState(false);
  return (
    <Section title="Dinner plans" action={<Button title="New plan" icon="add" size="sm" variant="ghost" onPress={() => setCreating(true)} />}>
      {table.plans.length ? (
        <View style={{ gap: space[2] }}>
          {table.plans.map((p) => (
            <PlanRow key={p.id} plan={p} />
          ))}
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Start a plan and everyone at the table is invited to suggest places and vote.
        </Text>
      )}
      {creating && <NewPlanSheet table={table} onClose={() => setCreating(false)} />}
    </Section>
  );
}

function TablePeople({ table }: { table: TableDetail }) {
  const { state } = useAuth();
  const me = state.status === 'signedIn' ? state.user.id : null;
  const toast = useToast();
  const queryClient = useQueryClient();
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends, enabled: table.isOwner });
  const [picking, setPicking] = useState(false);
  const onError = (err: unknown) => toast(err instanceof ApiError ? err.message : 'Something went wrong.', 'danger');
  const refresh = () => queryClient.invalidateQueries({ queryKey: qk.tables });

  const add = useMutation({
    mutationFn: (f: PublicUser) => api.addTableMembers(table.id, [f.id]),
    onSuccess: (_, f) => {
      refresh();
      toast(`Added ${f.displayName}`, 'success');
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (u: PublicUser) => api.removeTableMember(table.id, u.id),
    onSuccess: (_, u) => {
      if (u.id === me) {
        queryClient.removeQueries({ queryKey: qk.table(table.id) });
        queryClient.invalidateQueries({ queryKey: qk.tables });
        queryClient.invalidateQueries({ queryKey: ['lists'] });
        toast(`You left ${table.name}`, 'neutral');
        router.back();
      } else {
        refresh();
        toast(`Removed ${u.displayName}`, 'neutral');
      }
    },
    onError,
  });
  const del = useMutation({
    mutationFn: () => api.deleteTable(table.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: qk.table(table.id) });
      queryClient.invalidateQueries({ queryKey: qk.tables });
      queryClient.invalidateQueries({ queryKey: ['lists'] });
      toast(`Deleted ${table.name}`, 'neutral');
      router.back();
    },
    onError,
  });

  return (
    <Section
      title={`At this table · ${table.members.length}`}
      action={table.isOwner ? <Button title="Add people" icon="person-add" size="sm" variant="ghost" onPress={() => setPicking(true)} /> : undefined}>
      <View role="list" style={{ gap: space[1] }}>
        {table.members.map((m) => (
          <View key={m.id} role="listitem" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52 }}>
            <Avatar name={m.displayName} uri={m.avatarUrl} decorative />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">
                {m.displayName}
                {m.id === me ? ' (you)' : ''}
              </Text>
              <Text variant="caption" tone="muted">
                @{m.username}
                {m.id === table.owner.id ? ' · Started the table' : ''}
              </Text>
            </View>
            {table.isOwner && m.id !== me && (
              <IconButton icon="close" size="sm" accessibilityLabel={`Remove ${m.displayName} from the table`} onPress={() => remove.mutate(m)} />
            )}
          </View>
        ))}
      </View>
      {table.isOwner ? (
        <Button title="Delete table" variant="ghost" size="sm" loading={del.isPending} onPress={() => del.mutate()} style={{ alignSelf: 'flex-start' }} />
      ) : (
        <Button
          title="Leave table"
          variant="ghost"
          size="sm"
          loading={remove.isPending}
          onPress={() => me && remove.mutate(table.members.find((m) => m.id === me)!)}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
      {table.isOwner && (
        <FriendPicker
          visible={picking}
          title={`Add to ${table.name}`}
          actionLabel={(f) => `Add ${f.displayName}`}
          friends={(friends.data ?? []).filter((f) => !table.members.some((m) => m.id === f.id))}
          onClose={() => setPicking(false)}
          onPick={(f) => {
            setPicking(false);
            add.mutate(f);
          }}
        />
      )}
    </Section>
  );
}
