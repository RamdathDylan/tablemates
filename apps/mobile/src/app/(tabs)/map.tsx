import type { MapPlace, MapPlacesQuery } from '@tablemates/shared';
import {
  Card,
  Chip,
  EmptyState,
  focusRing,
  Icon,
  IconButton,
  maxContentWidth,
  radius,
  Rating,
  RestaurantCard,
  space,
  Text,
  useBreakpoint,
  useTheme,
  useToast,
  type PressState,
} from '@tablemates/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FriendPicker } from '@/components/friend-picker';
import { PlacePreview } from '@/components/map/place-preview';
import { mapsAvailable, TableMap } from '@/components/map/table-map';
import { ErrorState, LoadingCards } from '@/components/query-state';
import { api } from '@/lib/api';
import { useLocation } from '@/lib/location';
import { qk } from '@/lib/query-keys';
import { useDocumentTitle } from '@/lib/use-document-title';

type Scope = NonNullable<MapPlacesQuery['scope']>;
type Sort = NonNullable<MapPlacesQuery['sort']>;

/** Filters live in the URL so a filtered map can be bookmarked or shared on web. */
interface Params {
  scope?: Scope;
  friend?: string;
  rec?: string;
  min?: string;
  saved?: string;
  cuisine?: string;
  sort?: Sort;
  view?: 'map' | 'list';
  [key: string]: string | undefined;
}

const sortLabels: Record<Sort, string> = {
  recommended: 'Most recommended',
  rating: 'Highest rated',
  recent: 'Recent',
  distance: 'Nearest',
};

export default function MapScreen() {
  useDocumentTitle('Map');
  const { colors } = useTheme();
  const bp = useBreakpoint();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Params>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [centerKey, setCenterKey] = useState(0);
  const location = useLocation();
  const toast = useToast();

  /** The location, prompting if needed; explains itself if the user says no. */
  async function needLocation(reason: string) {
    const coords = location.coords ?? (await location.request());
    if (!coords) toast(`Allow location access to ${reason}.`);
    return coords;
  }

  const scope: Scope = params.scope === 'friend' && !params.friend ? 'everyone' : (params.scope ?? 'everyone');
  const query: MapPlacesQuery = {
    scope,
    friendId: scope === 'friend' ? params.friend : undefined,
    recommended: params.rec === '1' ? true : undefined,
    minRating: params.min ? Number(params.min) : undefined,
    saved: params.saved === '1' ? true : undefined,
    // "Nearest" only applies once we know where the user is.
    sort: params.sort === 'distance' && !location.coords ? 'recommended' : (params.sort ?? 'recommended'),
    lat: location.coords?.lat,
    lng: location.coords?.lng,
  };
  const set = (next: Partial<Params>) => {
    setSelectedId(null);
    router.setParams(next);
  };

  const places = useQuery({
    queryKey: qk.map(query),
    queryFn: () => api.mapPlaces(query),
    placeholderData: keepPreviousData,
  });
  const friends = useQuery({ queryKey: qk.friends, queryFn: api.friends });
  const friendName = friends.data?.find((f) => f.id === params.friend)?.displayName;

  // Cuisine is filtered here so the chip list can come from the unfiltered results.
  const all = places.data ?? [];
  const cuisines = [...new Set(all.flatMap((p) => p.restaurant.cuisine))].sort().slice(0, 12);
  const shown = params.cuisine ? all.filter((p) => p.restaurant.cuisine.includes(params.cuisine!)) : all;
  const selected = shown.find((p) => p.restaurant.id === selectedId) ?? null;
  const filtered = scope !== 'everyone' || !!params.rec || !!params.min || !!params.saved || !!params.cuisine;
  const clearFilters = () =>
    set({ scope: undefined, friend: undefined, rec: undefined, min: undefined, saved: undefined, cuisine: undefined });

  const filterBar = (
    <View style={{ gap: space[2] }}>
      <ChipRow>
        <Chip label="Everyone" selected={scope === 'everyone'} onPress={() => set({ scope: undefined, friend: undefined })} />
        <Chip label="Just me" selected={scope === 'me'} onPress={() => set({ scope: 'me', friend: undefined })} />
        <Chip label="Friends" selected={scope === 'friends'} onPress={() => set({ scope: 'friends', friend: undefined })} />
        <Chip
          label={scope === 'friend' && friendName ? friendName : 'One friend'}
          icon="person"
          selected={scope === 'friend'}
          accessibilityLabel={scope === 'friend' && friendName ? `Showing ${friendName}'s places. Change friend` : 'Pick a friend'}
          onPress={() => setPicking(true)}
        />
      </ChipRow>
      <ChipRow>
        <Chip label="Recommended" icon="thumbs-up" selected={params.rec === '1'} onPress={() => set({ rec: params.rec === '1' ? undefined : '1' })} />
        <Chip label="4★ & up" icon="star" selected={params.min === '4'} onPress={() => set({ min: params.min === '4' ? undefined : '4' })} />
        <Chip label="Want to try" icon="bookmark" selected={params.saved === '1'} onPress={() => set({ saved: params.saved === '1' ? undefined : '1' })} />
        {cuisines.map((c) => (
          <Chip
            key={c}
            label={c}
            selected={params.cuisine === c}
            onPress={() => set({ cuisine: params.cuisine === c ? undefined : c })}
          />
        ))}
      </ChipRow>
    </View>
  );

  const topRecommended = [...shown]
    .filter((p) => p.friends.recommends > 0)
    .sort((a, b) => b.friends.recommends - a.friends.recommends || (b.friends.averageRating ?? 0) - (a.friends.averageRating ?? 0))
    .slice(0, 5);

  const mostRecommended = topRecommended.length > 0 && (
    <View style={{ gap: space[2] }}>
      <Text variant="overline" tone="muted" role="heading">
        Most recommended by friends
      </Text>
      <Card padding={0} style={{ padding: space[2] }}>
        {topRecommended.map((p, i) => (
          <TopRow key={p.restaurant.id} rank={i + 1} place={p} onPress={() => open(p)} />
        ))}
      </Card>
    </View>
  );

  const list = (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <Text variant="overline" tone="muted" role="heading">
          {shown.length} place{shown.length === 1 ? '' : 's'}
        </Text>
      </View>
      <ChipRow>
        {(Object.keys(sortLabels) as Sort[]).map((s) => (
          <Chip
            key={s}
            label={sortLabels[s]}
            icon={s === 'distance' ? 'navigate' : undefined}
            selected={query.sort === s}
            onPress={async () => {
              if (s === 'distance' && !(await needLocation('sort by distance'))) return;
              set({ sort: s === 'recommended' ? undefined : s });
            }}
          />
        ))}
      </ChipRow>
      {shown.map((p) => (
        <RestaurantCard
          key={p.restaurant.id}
          name={p.restaurant.name}
          address={p.restaurant.address}
          cuisine={p.restaurant.cuisine}
          priceLevel={p.restaurant.priceLevel}
          friendStats={p.friends.count ? p.friends : undefined}
          you={p.me ?? undefined}
          distanceKm={p.distanceKm}
          onPress={() => open(p)}
        />
      ))}
    </View>
  );

  /** On wide screens a list tap selects the pin; on phones it opens the restaurant. */
  function open(p: MapPlace) {
    if (bp !== 'phone' && mapsAvailable) setSelectedId(p.restaurant.id);
    else router.push({ pathname: '/restaurant/[id]', params: { id: p.restaurant.id } });
  }

  const body = places.isPending ? (
    <LoadingCards count={2} />
  ) : places.isError ? (
    <ErrorState error={places.error} onRetry={() => places.refetch()} />
  ) : all.length === 0 && !filtered ? (
    <EmptyState
      icon="map-outline"
      title="No pins yet"
      message="Places you and your friends log show up here."
      action={{ label: 'Log a visit', onPress: () => router.navigate('/log') }}
    />
  ) : shown.length === 0 ? (
    <EmptyState icon="funnel-outline" title="Nothing matches" message="Try fewer filters." action={{ label: 'Clear filters', onPress: clearFilters }} />
  ) : null;

  const map = mapsAvailable ? (
    <View style={{ flex: 1 }}>
      <TableMap
        places={shown}
        selectedId={selectedId}
        onSelect={setSelectedId}
        userLocation={location.coords}
        centerOnUser={centerKey}
      />
      <View style={{ position: 'absolute', top: space[3], right: space[3] }}>
        <IconButton
          icon="navigate"
          variant="secondary"
          size="lg"
          accessibilityLabel="Center on my location"
          onPress={async () => {
            if (await needLocation('center the map on you')) setCenterKey((k) => k + 1);
          }}
        />
      </View>
      {selected && (
        <View
          style={{
            position: 'absolute',
            left: space[4],
            right: bp === 'phone' ? space[4] : undefined,
            bottom: space[4],
            width: bp === 'phone' ? undefined : 380,
          }}>
          <PlacePreview place={selected} onClose={() => setSelectedId(null)} />
        </View>
      )}
    </View>
  ) : null;

  const picker = (
    <FriendPicker
      visible={picking}
      friends={friends.data ?? []}
      onClose={() => setPicking(false)}
      onPick={(f) => {
        setPicking(false);
        set({ scope: 'friend', friend: f.id });
      }}
    />
  );

  if (bp !== 'phone' && mapsAvailable) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
        <ScrollView
          style={{ width: bp === 'desktop' ? 400 : 340, flexGrow: 0, borderRightWidth: 1, borderRightColor: colors.border }}
          contentContainerStyle={{ padding: space[4], paddingTop: insets.top + space[4], gap: space[4] }}>
          <Text variant="title">Map</Text>
          {filterBar}
          {body ?? (
            <>
              {mostRecommended}
              {list}
            </>
          )}
        </ScrollView>
        {map}
        {picker}
      </View>
    );
  }

  const view = mapsAvailable ? (params.view ?? 'map') : 'list';
  const column = { width: '100%', maxWidth: maxContentWidth, alignSelf: 'center' } as const;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[column, { paddingTop: insets.top + space[3], paddingHorizontal: space[4], paddingBottom: space[3], gap: space[3] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="title">Map</Text>
          {mapsAvailable && (
            <View role="tablist" style={{ flexDirection: 'row', gap: space[1] }}>
              <Chip label="Map" icon="map" selected={view === 'map'} onPress={() => router.setParams({ view: undefined })} />
              <Chip label="List" icon="list" selected={view === 'list'} onPress={() => router.setParams({ view: 'list' })} />
            </View>
          )}
        </View>
        {filterBar}
      </View>
      {view === 'map' && !body ? (
        map
      ) : (
        <ScrollView contentContainerStyle={[column, { padding: space[4], paddingTop: 0, gap: space[4], paddingBottom: space[10] }]}>
          {!mapsAvailable && <MapsUnavailable />}
          {body ?? (
            <>
              {mostRecommended}
              {list}
            </>
          )}
        </ScrollView>
      )}
      {picker}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
      {children}
    </ScrollView>
  );
}

function TopRow({ rank, place, onPress }: { rank: number; place: MapPlace; onPress: () => void }) {
  const { colors } = useTheme();
  const n = place.friends.recommends;
  const who = `${n} friend${n === 1 ? ' recommends' : 's recommend'}`;
  return (
    <Pressable
      role="button"
      accessibilityLabel={`Number ${rank}, ${place.restaurant.name}, ${who}`}
      onPress={onPress}
      style={(state: PressState) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          minHeight: 52,
          paddingHorizontal: space[2],
          borderRadius: radius.md,
          backgroundColor: state.pressed || state.hovered ? colors.surfaceSunken : 'transparent',
        },
        focusRing(state, colors),
      ]}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: radius.full,
          backgroundColor: rank === 1 ? colors.primary : colors.primarySoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text variant="label" style={{ color: rank === 1 ? colors.onPrimary : colors.onPrimarySoft }}>
          {rank}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {place.restaurant.name}
        </Text>
        <Text variant="caption" tone="muted">
          {who}
        </Text>
      </View>
      {place.friends.averageRating !== null && <Rating value={place.friends.averageRating} size="sm" showValue />}
    </Pressable>
  );
}

function MapsUnavailable() {
  return (
    <Card style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
      <Icon name="information-circle" color="info" />
      <Text variant="caption" tone="muted" style={{ flex: 1 }}>
        The map view needs a Google Maps key (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). Showing the list instead.
      </Text>
    </Card>
  );
}
