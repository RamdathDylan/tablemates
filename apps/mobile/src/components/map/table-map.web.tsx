import { MapPin, palette } from '@tablemates/ui';
import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { useEffect } from 'react';

import { CheckinMarker, checkinLabel } from '../out-now';
import { framePoints, mappable, mappableCheckins, pinKind, pinLabel, type TableMapProps } from './shared';

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
// Advanced markers require a Map ID; Google's demo ID works for development.
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

/** Web map, via the Google Maps JavaScript API. */
export const mapsAvailable = API_KEY.length > 0;

export function TableMap({ places, selectedId, onSelect, userLocation, centerOnUser, checkins, onOpenCheckin, viewerId, route }: TableMapProps) {
  const stopOf = (id: string) => {
    const i = route?.findIndex((r) => r.id === id) ?? -1;
    return i >= 0 ? i + 1 : undefined;
  };
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
        <FitToPins places={places} checkins={checkins} />
        <PanToSelected places={places} selectedId={selectedId} />
        <CenterOnUser location={userLocation} trigger={centerOnUser} />
        {route && route.length > 1 && <RouteLine points={route} />}
        {userLocation && (
          <AdvancedMarker position={userLocation} title="You are here" zIndex={0}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                background: palette.sky[600],
                border: '3px solid white',
                boxShadow: '0 0 0 6px rgba(47, 98, 208, 0.2)',
              }}
            />
          </AdvancedMarker>
        )}
        {pins.map((p) => {
          const selected = p.restaurant.id === selectedId;
          return (
            <AdvancedMarker
              key={p.restaurant.id}
              position={{ lat: p.restaurant.lat, lng: p.restaurant.lng }}
              title={pinLabel(p)}
              zIndex={selected ? 2 : 1}
              onClick={() => onSelect(p.restaurant.id)}>
              <MapPin kind={pinKind(p)} rating={p.summary.averageRating} recommended={p.summary.recommends > 0} saved={p.saved} crowned={!!viewerId && p.mayor?.id === viewerId} stop={stopOf(p.restaurant.id)} selected={selected} />
            </AdvancedMarker>
          );
        })}
        {mappableCheckins(checkins).map((c) => (
          // Above the restaurant's own pin, so both stay visible.
          <AdvancedMarker
            key={c.id}
            position={{ lat: c.restaurant.lat, lng: c.restaurant.lng }}
            title={checkinLabel(c)}
            zIndex={3}
            anchorPoint={['50%', '160%']}
            onClick={() => onOpenCheckin?.(c)}>
            <CheckinMarker checkin={c} />
          </AdvancedMarker>
        ))}
      </Map>
    </APIProvider>
  );
}

/** Re-frames the map whenever the set of pins changes (e.g. a filter changed). */
function FitToPins({ places, checkins }: Pick<TableMapProps, 'places' | 'checkins'>) {
  const map = useMap();
  const pins = framePoints(places, checkins);
  const key = pins.map((p) => p.id).join(',');
  useEffect(() => {
    if (!map || !pins.length) return;
    if (pins.length === 1) {
      map.setCenter({ lat: pins[0]!.lat, lng: pins[0]!.lng });
      map.setZoom(15);
      return;
    }
    const lats = pins.map((p) => p.lat);
    const lngs = pins.map((p) => p.lng);
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

/** A dashed line through a crawl's stops, in order. */
function RouteLine({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  const maps = useMapsLibrary('maps');
  const key = points.map((p) => `${p.lat},${p.lng}`).join('|');
  useEffect(() => {
    if (!map || !maps) return;
    const line = new maps.Polyline({
      map,
      path: points,
      strokeOpacity: 0,
      // Dashes are drawn as repeated line symbols; a plain dashed stroke isn't supported.
      icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, strokeColor: palette.tomato[600], scale: 3 }, offset: '0', repeat: '14px' }],
    });
    return () => line.setMap(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, maps, key]);
  return null;
}

function CenterOnUser({ location, trigger }: { location?: { lat: number; lng: number } | null; trigger?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !trigger || !location) return;
    map.panTo(location);
    map.setZoom(14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, trigger]);
  return null;
}
