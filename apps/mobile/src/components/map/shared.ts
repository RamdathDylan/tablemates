import type { MapPlace } from '@tablemates/shared';
import type { MapPinKind } from '@tablemates/ui';

export interface TableMapProps {
  places: MapPlace[];
  selectedId: string | null;
  onSelect: (restaurantId: string | null) => void;
}

/** Places that can be drawn (Google gave us coordinates). */
export function mappable(places: MapPlace[]) {
  return places.filter(
    (p): p is MapPlace & { restaurant: { lat: number; lng: number } } =>
      p.restaurant.lat !== null && p.restaurant.lng !== null,
  );
}

export function pinKind(place: MapPlace): MapPinKind {
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
  return parts.join(', ');
}
