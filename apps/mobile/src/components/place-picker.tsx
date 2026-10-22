import type { PlaceResult } from '@tablemates/shared';
import { Chip, Input, space, Text } from '@tablemates/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { qk } from '@/lib/query-keys';
import { useDebounced } from '@/lib/use-debounced';

export type PickedPlace = { restaurantId?: string; googlePlaceId?: string; name: string };

/** Choose a restaurant from your Want to try list, your own places, or a search. */
export function PlacePicker({ value, onChange }: { value: PickedPlace | null; onChange: (p: PickedPlace) => void }) {
  const location = useLocation();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim(), 350);
  const mine = useQuery({ queryKey: qk.myVisits, queryFn: api.myVisits });
  const saved = useQuery({ queryKey: qk.saved, queryFn: api.saved });
  const results = useQuery({
    queryKey: [...qk.places(q), location.coords],
    queryFn: () => api.searchPlaces(q, location.coords),
    enabled: q.length >= 2,
  });
  const unique = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()].slice(0, 8);
  const groups = [
    { title: 'Want to try', places: unique((saved.data ?? []).map((s) => s.restaurant)) },
    { title: 'Your places', places: unique((mine.data ?? []).map((v) => v.restaurant)) },
  ].filter((g) => g.places.length);

  return (
    <View style={{ gap: space[4] }}>
      {groups.map((g) => (
        <View key={g.title} style={{ gap: space[2] }}>
          <Text variant="overline" tone="muted">
            {g.title}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {g.places.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                selected={value?.restaurantId === r.id}
                onPress={() => onChange({ restaurantId: r.id, name: r.name })}
              />
            ))}
          </View>
        </View>
      ))}
      <Input label="Search restaurants" hideLabel icon="search" placeholder="Search for a place" value={query} onChangeText={setQuery} />
      {results.data && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {results.data.slice(0, 6).map((p: PlaceResult) => (
            <Chip
              key={p.googlePlaceId}
              label={`${p.name} · ${p.address.split(',')[0]}`}
              selected={value?.googlePlaceId === p.googlePlaceId}
              onPress={() => onChange({ googlePlaceId: p.googlePlaceId, name: p.name })}
            />
          ))}
        </View>
      )}
    </View>
  );
}
