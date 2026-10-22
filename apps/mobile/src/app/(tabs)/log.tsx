import type { PlaceResult } from '@tablemates/shared';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Icon,
  Input,
  Rating,
  RestaurantCard,
  space,
  Text,
  TextArea,
  useToast,
} from '@tablemates/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AudiencePicker } from '@/components/audience-picker';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { Screen, Section } from '@/components/screen';
import { api, ApiError } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { useAuth, useMe } from '@/lib/auth';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';

/** YYYY-MM-DD in the user's local time zone. */
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Picked = Pick<PlaceResult, 'googlePlaceId' | 'name' | 'address'> & Partial<PlaceResult>;

export default function LogScreen() {
  // The restaurant page links here with a place already chosen.
  const params = useLocalSearchParams<{ googlePlaceId?: string; name?: string; address?: string }>();
  const [picked, setPicked] = useState<Picked | null>(null);
  const place: Picked | null =
    picked ??
    (params.googlePlaceId && params.name
      ? { googlePlaceId: params.googlePlaceId, name: params.name, address: params.address ?? '' }
      : null);

  return (
    <Screen title="Log a visit">
      {place ? (
        <VisitForm
          place={place}
          onChangePlace={() => {
            setPicked(null);
            router.setParams({ googlePlaceId: undefined, name: undefined, address: undefined });
          }}
        />
      ) : (
        <PlaceSearch onPick={setPicked} />
      )}
    </Screen>
  );
}

function PlaceSearch({ onPick }: { onPick: (place: PlaceResult) => void }) {
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 350);
  const location = useLocation();
  const results = useQuery({
    queryKey: [...qk.places(q), location.coords],
    queryFn: () => api.searchPlaces(q, location.coords),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
  });

  return (
    <>
      <Input
        label="Search restaurants"
        hideLabel
        icon="search"
        placeholder="Where did you eat?"
        value={query}
        onChangeText={setQuery}
        autoFocus
        returnKeyType="search"
      />
      {location.coords ? (
        <Text variant="caption" tone="muted">
          Showing restaurants near you first.
        </Text>
      ) : location.permission === 'undetermined' ? (
        <Button
          title="Use my location for nearby results"
          icon="navigate"
          variant="ghost"
          size="sm"
          onPress={() => location.request()}
        />
      ) : null}
      {q.length < 2 ? (
        <EmptyState
          icon="restaurant-outline"
          title="Where did you eat?"
          message="Search by name, then rate it and tell your friends whether it's worth the trip."
        />
      ) : results.isPending ? (
        <LoadingCards count={2} />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState icon="search" title="No restaurants found" message={`Nothing matched "${q}".`} />
      ) : (
        results.data.map((p) => (
          <RestaurantCard
            key={p.googlePlaceId}
            name={p.name}
            address={p.address}
            cuisine={p.cuisine}
            priceLevel={p.priceLevel}
            onPress={() => onPick(p)}
          />
        ))
      )}
    </>
  );
}

function VisitForm({ place, onChangePlace }: { place: Picked; onChangePlace: () => void }) {
  const me = useMe();
  const { setUser } = useAuth();
  const toast = useToast();
  const [audience, setAudience] = useState(me.defaultAudience);
  const queryClient = useQueryClient();
  const [visitedAt, setVisitedAt] = useState(localDate());
  const [rating, setRating] = useState(0);
  const [recommends, setRecommends] = useState<boolean | null>(null);
  const [dishes, setDishes] = useState<string[]>([]);
  const [dishDraft, setDishDraft] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: () =>
      api.createVisit({
        googlePlaceId: place.googlePlaceId,
        visitedAt,
        audience,
        review: rating ? { rating, recommends: !!recommends, dishes, body } : undefined,
      }),
    onSuccess: (visit) => {
      // The server remembers this choice for next time; mirror it locally.
      if (visit.audience !== me.defaultAudience) setUser({ ...me, defaultAudience: visit.audience });
      queryClient.invalidateQueries({ queryKey: qk.myVisits });
      queryClient.invalidateQueries({ queryKey: qk.profile(me.username) });
      queryClient.invalidateQueries({ queryKey: qk.restaurant(visit.restaurant.id) });
      toast(
        visit.audience === 'private' ? 'Saved privately' : visit.review ? 'Review shared with your friends' : 'Visit logged',
        'success',
      );
      onChangePlace();
      router.push({ pathname: '/restaurant/[id]', params: { id: visit.restaurant.id } });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't save. Try again."),
  });

  function addDish() {
    const dish = dishDraft.trim();
    if (dish && !dishes.includes(dish) && dishes.length < 10) setDishes([...dishes, dish]);
    setDishDraft('');
  }

  function submit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visitedAt)) return setError('Use the format YYYY-MM-DD for the date.');
    if (rating && recommends === null) return setError('Let your friends know whether you recommend it.');
    setError(undefined);
    save.mutate();
  }

  return (
    <>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Icon name="restaurant" size={22} color="primary" />
        <View style={{ flex: 1 }}>
          <Text variant="subheading" numberOfLines={1}>
            {place.name}
          </Text>
          {!!place.address && (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {place.address}
            </Text>
          )}
        </View>
        <Button title="Change" variant="ghost" size="sm" onPress={onChangePlace} />
      </Card>

      <Section title="When">
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Chip label="Today" selected={visitedAt === localDate()} onPress={() => setVisitedAt(localDate())} />
          <Chip label="Yesterday" selected={visitedAt === localDate(-1)} onPress={() => setVisitedAt(localDate(-1))} />
        </View>
        <Input label="Date visited" hideLabel value={visitedAt} onChangeText={setVisitedAt} placeholder="YYYY-MM-DD" />
      </Section>

      <Section title="Your rating">
        <Rating value={rating} onChange={setRating} size="lg" />
      </Section>

      {rating > 0 && (
        <>
          <Section title="Would you recommend it?">
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Chip label="Yes, go" icon="thumbs-up" selected={recommends === true} onPress={() => setRecommends(true)} />
              <Chip label="Not really" icon="thumbs-down" selected={recommends === false} onPress={() => setRecommends(false)} />
            </View>
          </Section>

          <Section title="What to order">
            <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Input
                  label="Add a dish"
                  hideLabel
                  placeholder="e.g. Cacio e pepe"
                  value={dishDraft}
                  onChangeText={setDishDraft}
                  onSubmitEditing={addDish}
                  returnKeyType="done"
                />
              </View>
              <Button title="Add" variant="secondary" onPress={addDish} disabled={!dishDraft.trim()} />
            </View>
            {dishes.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {dishes.map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    icon="close"
                    tone="accent"
                    accessibilityLabel={`Remove ${d}`}
                    onPress={() => setDishes(dishes.filter((x) => x !== d))}
                  />
                ))}
              </View>
            )}
          </Section>

          <TextArea label="Notes for your friends" value={body} onChangeText={setBody} maxLength={2000} placeholder="Go on a weeknight, sit at the bar…" />
        </>
      )}

      <Section title="Who can see this">
        <AudiencePicker value={audience} onChange={setAudience} />
      </Section>

      {error && (
        <Text tone="danger" role="alert">
          {error}
        </Text>
      )}
      <Button
        title={audience === 'private' ? 'Save privately' : rating ? 'Share with friends' : 'Save visit without a review'}
        onPress={submit}
        loading={save.isPending}
        fullWidth
        size="lg"
      />
    </>
  );
}
