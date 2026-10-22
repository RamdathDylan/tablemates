import { MapPin } from '@tablemates/ui';
import { useEffect, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';

import { mappable, pinKind, pinLabel, type TableMapProps } from './shared';

/** Native map: Apple Maps on iOS, Google Maps on Android. */
export function TableMap({ places, selectedId, onSelect }: TableMapProps) {
  const ref = useRef<MapView>(null);
  const pins = mappable(places);
  const fitKey = pins.map((p) => p.restaurant.id).join(',');

  // Re-frame whenever the set of pins changes (e.g. a filter changed).
  useEffect(() => {
    if (!pins.length) return;
    ref.current?.fitToCoordinates(
      pins.map((p) => ({ latitude: p.restaurant.lat, longitude: p.restaurant.lng })),
      { edgePadding: { top: 80, right: 60, bottom: 260, left: 60 }, animated: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const p = pins.find((x) => x.restaurant.id === selectedId);
    if (p) {
      ref.current?.animateCamera({ center: { latitude: p.restaurant.lat, longitude: p.restaurant.lng } }, { duration: 300 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <MapView ref={ref} style={{ flex: 1 }} onPress={() => onSelect(null)} showsPointsOfInterests={false} toolbarEnabled={false}>
      {pins.map((p) => {
        const selected = p.restaurant.id === selectedId;
        return (
          <Marker
            // Remount on selection so the custom view re-renders with tracksViewChanges off.
            key={`${p.restaurant.id}-${selected}`}
            coordinate={{ latitude: p.restaurant.lat, longitude: p.restaurant.lng }}
            onPress={(e) => {
              e.stopPropagation();
              onSelect(p.restaurant.id);
            }}
            tracksViewChanges={false}
            accessibilityLabel={pinLabel(p)}
            zIndex={selected ? 2 : 1}>
            <MapPin kind={pinKind(p)} rating={p.summary.averageRating} recommended={p.summary.recommends > 0} selected={selected} />
          </Marker>
        );
      })}
    </MapView>
  );
}

export const mapsAvailable = true;
