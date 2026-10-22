import { MapPin } from '@tablemates/ui';
import { useEffect, useRef } from 'react';
import MapView, { Marker } from 'react-native-maps';

import { mappable, pinKind, pinLabel, type TableMapProps } from './shared';

/** Native map: Apple Maps on iOS, Google Maps on Android. */
export function TableMap({ places, selectedId, onSelect, userLocation, centerOnUser }: TableMapProps) {
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

  useEffect(() => {
    if (!centerOnUser || !userLocation) return;
    ref.current?.animateCamera(
      { center: { latitude: userLocation.lat, longitude: userLocation.lng }, zoom: 14 },
      { duration: 400 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerOnUser]);

  return (
    <MapView
      ref={ref}
      style={{ flex: 1 }}
      onPress={() => onSelect(null)}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
      showsUserLocation={!!userLocation}
      // With no pins yet, start where the user is.
      initialRegion={
        !pins.length && userLocation
          ? { latitude: userLocation.lat, longitude: userLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
          : undefined
      }>
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
            <MapPin kind={pinKind(p)} rating={p.summary.averageRating} recommended={p.summary.recommends > 0} saved={p.saved} selected={selected} />
          </Marker>
        );
      })}
    </MapView>
  );
}

export const mapsAvailable = true;
