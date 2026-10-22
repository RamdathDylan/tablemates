import { MapPin } from '@tablemates/ui';
import { AdvancedMarker, APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

import { mappable, pinKind, pinLabel, type TableMapProps } from './shared';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
// Advanced markers require a Map ID; Google's demo ID works for development.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

/** Web map, via the Google Maps JavaScript API. */
export const mapsAvailable = API_KEY.length > 0;

export function TableMap({ places, selectedId, onSelect }: TableMapProps) {
  const pins = mappable(places);
  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        mapId={MAP_ID}
        style={{ flex: 1, width: '100%', height: '100%' }}
        defaultCenter={{ lat: 40.73, lng: -73.99 }}
        defaultZoom={12}
        gestureHandling="greedy"
        clickableIcons={false}
        disableDefaultUI
        zoomControl
        onClick={() => onSelect(null)}>
        <FitToPins places={places} />
        <PanToSelected places={places} selectedId={selectedId} />
        {pins.map((p) => {
          const selected = p.restaurant.id === selectedId;
          return (
            <AdvancedMarker
              key={p.restaurant.id}
              position={{ lat: p.restaurant.lat, lng: p.restaurant.lng }}
              title={pinLabel(p)}
              zIndex={selected ? 2 : 1}
              onClick={() => onSelect(p.restaurant.id)}>
              <MapPin kind={pinKind(p)} rating={p.summary.averageRating} recommended={p.summary.recommends > 0} selected={selected} />
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}

/** Re-frames the map whenever the set of pins changes (e.g. a filter changed). */
function FitToPins({ places }: { places: TableMapProps['places'] }) {
  const map = useMap();
  const pins = mappable(places);
  const key = pins.map((p) => p.restaurant.id).join(',');
  useEffect(() => {
    if (!map || !pins.length) return;
    if (pins.length === 1) {
      map.setCenter({ lat: pins[0]!.restaurant.lat, lng: pins[0]!.restaurant.lng });
      map.setZoom(15);
      return;
    }
    const lats = pins.map((p) => p.restaurant.lat);
    const lngs = pins.map((p) => p.restaurant.lng);
    map.fitBounds(
      { north: Math.max(...lats), south: Math.min(...lats), east: Math.max(...lngs), west: Math.min(...lngs) },
      64,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function PanToSelected({ places, selectedId }: { places: TableMapProps['places']; selectedId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const p = mappable(places).find((x) => x.restaurant.id === selectedId);
    if (map && p) map.panTo({ lat: p.restaurant.lat, lng: p.restaurant.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId]);
  return null;
}
