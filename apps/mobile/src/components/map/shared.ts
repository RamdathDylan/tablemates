import type { Checkin, MapPlace } from '@tablemates/shared';
import type { MapPinKind } from '@tablemates/ui';

export interface TableMapProps {
  places: MapPlace[];
  selectedId: string | null;
  onSelect: (restaurantId: string | null) => void;
  /** Shown as a dot when the user has shared their location. */
  userLocation?: { lat: number; lng: number } | null;
  /** Bump `key` to pan the map to the user (the "Center on me" button). */
  centerOnUser?: number;
  /** Friends out right now, drawn as avatars at their restaurants. */
  checkins?: Checkin[];
  onOpenCheckin?: (checkin: Checkin) => void;
}

/** Every point the map should frame: pins, plus friends out now. */
export function framePoints(places: MapPlace[], checkins: Checkin[] = []) {
  return [...mappable(places), ...mappableCheckins(checkins)].map((p) => ({ id: p.restaurant.id, lat: p.restaurant.lat, lng: p.restaurant.lng }));
}

export function mappableCheckins(checkins: Checkin[] = []) {
  return checkins.filter(
    (c): c is Checkin & { restaurant: { lat: number; lng: number } } => c.restaurant.lat !== null && c.restaurant.lng !== null,
  );
}

/** Places that can be drawn (Google gave us coordinates). */
export function mappable(places: MapPlace[]) {
  return places.filter(
    (p): p is MapPlace & { restaurant: { lat: number; lng: number } } =>
      p.restaurant.lat !== null && p.restaurant.lng !== null,
  );
}

export function pinKind(place: MapPlace): MapPinKind {
  if (!place.me && place.friends.count === 0) return 'saved';
  if (place.me && place.friends.count > 0) return 'both';
  return place.me ? 'mine' : 'friends';
}

/** What a screen reader announces for a pin. */
export function pinLabel(place: MapPlace) {
  const parts = [place.restaurant.name];
  if (place.summary.averageRating !== null) parts.push(`${place.summary.averageRating} stars`);
  if (place.summary.recommends) parts.push(`${place.summary.recommends} recommend`);
  if (place.me) parts.push("you've been");
  if (place.friends.count) parts.push(`${place.friends.count} friend${place.friends.count === 1 ? '' : 's'} visited`);
  if (place.saved) parts.push('on your want-to-try list');
  return parts.join(', ');
}
