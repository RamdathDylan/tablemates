import type { Restaurant } from '@tablemates/shared';
import { Linking } from 'react-native';

/** Opens the place in Google Maps (app or web): directions, hours, and reservations live there. */
export function openDirections(r: Pick<Restaurant, 'name' | 'address' | 'googlePlaceId'> & { mapsUrl?: string | null }) {
  if (r.mapsUrl) return Linking.openURL(r.mapsUrl);
  const query = encodeURIComponent(`${r.name}, ${r.address}`);
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${r.googlePlaceId}`);
}
