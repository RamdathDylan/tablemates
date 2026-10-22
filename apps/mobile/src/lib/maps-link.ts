import type { Restaurant } from '@tablemates/shared';
import { Linking } from 'react-native';

/** Opens the place in Google Maps (app or web): directions, hours, and reservations live there. */
export function openDirections(r: Pick<Restaurant, 'name' | 'address' | 'googlePlaceId'> & { mapsUrl?: string | null }) {
  if (r.mapsUrl) return Linking.openURL(r.mapsUrl);
  const query = encodeURIComponent(`${r.name}, ${r.address}`);
  return Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${r.googlePlaceId}`);
}

/**
 * Google Maps walking directions through every stop, in order. Uses the public
 * directions URL, so no extra API is involved. Google allows up to 9 waypoints.
 */
export function walkingRouteUrl(stops: Pick<Restaurant, 'name' | 'address' | 'googlePlaceId'>[]) {
  const place = (r: (typeof stops)[number]) => encodeURIComponent(`${r.name}, ${r.address}`);
  const [first, ...rest] = stops;
  const last = rest.pop();
  if (!first) return null;
  const params = [`api=1`, `travelmode=walking`, `origin=${place(first)}`, `origin_place_id=${first.googlePlaceId}`];
  if (last) params.push(`destination=${place(last)}`, `destination_place_id=${last.googlePlaceId}`);
  if (rest.length) {
    params.push(`waypoints=${rest.slice(0, 9).map(place).join('%7C')}`, `waypoint_place_ids=${rest.slice(0, 9).map((r) => r.googlePlaceId).join('%7C')}`);
  }
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}
