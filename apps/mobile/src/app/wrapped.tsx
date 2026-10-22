import type { Wrapped } from '@tablemates/shared';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ColumnChart,
  EmptyState,
  RankedBars,
  Rating,
  space,
  Text,
  useTheme,
  useToast,
} from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ScrollView, Share, useWindowDimensions, View } from 'react-native';

import { GoalMeter } from '@/components/goal';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen } from '@/components/screen';
import { api } from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { useDocumentTitle } from '@/lib/use-document-title';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function WrappedScreen() {
  const params = useLocalSearchParams<{ year?: string }>();
  const thisYear = new Date().getFullYear();
  const year = Number(params.year) || thisYear;
  useDocumentTitle(`Your ${year} in food`);
  const wrapped = useQuery({ queryKey: qk.wrapped(year), queryFn: () => api.wrapped(year) });

  const yearPicker = (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {[thisYear, thisYear - 1].map((y) => (
        <Chip key={y} label={String(y)} selected={y === year} onPress={() => router.setParams({ year: String(y) })} />
      ))}
    </View>
  );

  if (wrapped.isPending) {
    return (
      <Screen header>
        {yearPicker}
        <LoadingCards count={1} />
      </Screen>
    );
  }
  if (wrapped.isError) {
    return (
      <Screen header>
        <ErrorState error={wrapped.error} onRetry={() => wrapped.refetch()} />
      </Screen>
    );
  }
  if (wrapped.data.totals.visits === 0) {
    return (
      <Screen header>
        {yearPicker}
        <EmptyState
          icon="calendar-outline"
          title={`No visits logged in ${year}`}
          message="Log the places you eat and your year in food builds itself."
          action={{ label: 'Log a visit', onPress: () => router.navigate('/log') }}
        />
      </Screen>
    );
  }
  return <Story data={wrapped.data} yearPicker={yearPicker} />;
}

function shareText(w: Wrapped) {
  const top = w.topRestaurants[0]?.restaurant.name;
  return [
    `My ${w.year} on TableMates: ${w.totals.visits} visits to ${w.totals.places} places (${w.totals.newPlaces} new).`,
    top ? `Most-visited: ${top}.` : '',
    w.topCuisines[0] ? `Top cuisine: ${w.topCuisines[0].name}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** A swipeable stack of cards, with Back/Next buttons so it works by keyboard and screen reader too. */
function Story({ data: w, yearPicker }: { data: Wrapped; yearPicker: ReactNode }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - space[4] * 2, 520);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const toast = useToast();
  const [page, setPage] = useState(0);

  const busiestMonth = w.byMonth.indexOf(Math.max(...w.byMonth));
  const busiestDay = w.byWeekday.indexOf(Math.max(...w.byWeekday));
  const cards: { key: string; title: string; body: ReactNode }[] = [
    {
      key: 'hero',
      title: `Your ${w.year} in food`,
      body: (
        <View style={{ gap: space[2] }}>
          <Text variant="display" style={{ fontSize: 64, lineHeight: 72, color: colors.primary }}>
            {w.totals.visits}
          </Text>
          <Text variant="subheading">visits to {w.totals.places} places</Text>
          <Text tone="muted">
            {w.totals.newPlaces} were new to you. You reviewed {w.totals.reviews} and recommended {w.totals.recommendations}.
          </Text>
        </View>
      ),
    },
    {
      key: 'months',
      title: 'When you ate out',
      body: (
        <View style={{ gap: space[3] }}>
          <ColumnChart values={w.byMonth} labels={MONTHS.map((m) => m[0]!)} spokenLabels={MONTHS} unit="visits" />
          <Text tone="muted">
            {MONTHS[busiestMonth]} was your busiest month, and {WEEKDAYS[busiestDay]} your favorite day to go out.
          </Text>
        </View>
      ),
    },
    ...(w.topCuisines.length
      ? [{ key: 'cuisines', title: 'What you craved', body: <RankedBars items={w.topCuisines.map((c) => ({ label: c.name, value: c.visits }))} unit="visits" /> }]
      : []),
    {
      key: 'spots',
      title: 'Your regular spots',
      body: (
        <View style={{ gap: space[3] }}>
          {w.topRestaurants.map((r, i) => (
            <View key={r.restaurant.id} style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
              <Text variant="heading" tone="primary" style={{ width: 28 }}>
                {i + 1}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" role="link" onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.restaurant.id } })}>
                  {r.restaurant.name}
                </Text>
                <Text variant="caption" tone="muted">
                  {r.visits} visit{r.visits === 1 ? '' : 's'}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ),
    },
    ...(w.companions.length
      ? [
          {
            key: 'people',
            title: 'Your dinner crew',
            body: (
              <View style={{ gap: space[3] }}>
                {w.companions.map((c) => (
                  <View key={c.user.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                    <Avatar name={c.user.displayName} uri={c.user.avatarUrl} decorative />
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {c.user.displayName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {c.visits} meal{c.visits === 1 ? '' : 's'} together
                    </Text>
                  </View>
                ))}
              </View>
            ),
          },
        ]
      : []),
    ...(w.goal
      ? [
          {
            key: 'goal',
            title: w.goal.done >= w.goal.target ? 'Goal crushed' : 'Your goal',
            body: (
              <View style={{ gap: space[3] }}>
                <Text variant="display" style={{ fontSize: 56, lineHeight: 64, color: colors.primary }}>
                  {w.goal.done}/{w.goal.target}
                </Text>
                <GoalMeter goal={w.goal} />
              </View>
            ),
          },
        ]
      : []),
    ...(w.bestNewFind
      ? [
          {
            key: 'find',
            title: 'Best new find',
            body: (
              <View style={{ gap: space[2] }}>
                <Text variant="title">{w.bestNewFind.restaurant.name}</Text>
                <Rating value={w.bestNewFind.rating} size="lg" />
                <Text tone="muted">{w.bestNewFind.restaurant.address}</Text>
              </View>
            ),
          },
        ]
      : []),
  ];

  const go = (i: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, i));
    setPage(next);
    scroller.current?.scrollTo({ x: next * (cardWidth + space[3]), animated: true });
  };

  return (
    <Screen header>
      {yearPicker}
      <ScrollView
        ref={scroller}
        horizontal
        snapToInterval={cardWidth + space[3]}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[3] }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardWidth + space[3])))}>
        {cards.map((c, i) => (
          <Card
            key={c.key}
            style={{ width: cardWidth, minHeight: 320, gap: space[4] }}
            aria-hidden={i !== page}
            accessibilityLabel={`Card ${i + 1} of ${cards.length}: ${c.title}`}>
            <Text variant="overline" tone="primary">
              {i + 1} / {cards.length}
            </Text>
            <Text variant="heading">{c.title}</Text>
            {c.body}
          </Card>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Button title="Back" icon="chevron-back" variant="secondary" size="sm" disabled={page === 0} onPress={() => go(page - 1)} />
        <View style={{ flexDirection: 'row', gap: space[1] }} aria-hidden>
          {cards.map((c, i) => (
            <View key={c.key} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === page ? colors.primary : colors.borderStrong }} />
          ))}
        </View>
        {page < cards.length - 1 ? (
          <Button title="Next" variant="secondary" size="sm" onPress={() => go(page + 1)} />
        ) : (
          <Button
            title="Share"
            icon="share-outline"
            size="sm"
            onPress={() =>
              // Some desktop browsers have no share sheet; say so rather than failing silently.
              Share.share({ message: shareText(w) }).catch(() => toast("Sharing isn't available in this browser."))
            }
          />
        )}
      </View>
    </Screen>
  );
}
