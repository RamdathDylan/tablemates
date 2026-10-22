import type { Restaurant } from '@tablemates/shared';
import { Linking } from 'react-native';

/** Opens directions in Google Maps (app or web) for a restaurant. */
export function openDirections(r: Pick<Restaurant, 'name' | 'address' | 'googlePlaceId'>) {
  const query = encodeURIComponent(`${r.name}, ${r.address}`);
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${r.googlePlaceId}`);
}
