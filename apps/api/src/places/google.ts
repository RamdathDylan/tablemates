import type { OpeningHours, PlaceResult } from '@tablemates/shared';

import { AppError } from '../lib/errors';
import type { PlacesProvider } from './types';

const BASE = 'https://places.googleapis.com/v1';
// Field masks keep requests in the cheapest SKU that has what we need. Search
// stays basic; details add hours/contact fields (a pricier SKU) because they're
// only fetched for a restaurant's own page and cached for 30 days.
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'priceLevel', 'types'];
const DETAIL_FIELDS = [
  ...FIELDS,
  'regularOpeningHours',
  'utcOffsetMinutes',
  'nationalPhoneNumber',
  'websiteUri',
  'googleMapsUri',
  'addressComponents',
];
const SEARCH_MASK = FIELDS.map((f) => `places.${f}`).join(',');
const DETAILS_MASK = DETAIL_FIELDS.join(',');

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  priceLevel?: string;
  types?: string[];
  regularOpeningHours?: OpeningHours;
  utcOffsetMinutes?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  addressComponents?: { longText: string; types: string[] }[];
}

/** The most specific neighborhood name Google gives (e.g. "West Village"). */
function neighborhoodOf(components: GooglePlace['addressComponents'] = []): string | null {
  for (const type of ['neighborhood', 'sublocality_level_1', 'sublocality']) {
    const c = components.find((x) => x.types.includes(type));
    if (c) return c.longText;
  }
  return null;
}

const PRICE_LEVELS: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** "italian_restaurant" → "Italian". Generic types are dropped. */
export function cuisineFromTypes(types: string[] = []): string[] {
  return types
    .filter((t) => t.endsWith('_restaurant') && t !== 'fast_food_restaurant')
    .map((t) =>
      t
        .replace(/_restaurant$/, '')
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    );
}

function toPlaceResult(p: GooglePlace): PlaceResult {
  return {
    googlePlaceId: p.id,
    name: p.displayName?.text ?? 'Unnamed place',
    address: p.formattedAddress ?? '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    priceLevel: p.priceLevel ? (PRICE_LEVELS[p.priceLevel] ?? null) : null,
    cuisine: cuisineFromTypes(p.types),
  };
}

function toPlaceDetails(p: GooglePlace): PlaceResult {
  return {
    ...toPlaceResult(p),
    hours: p.regularOpeningHours
      ? { periods: p.regularOpeningHours.periods ?? [], weekdayDescriptions: p.regularOpeningHours.weekdayDescriptions ?? [] }
      : null,
    utcOffsetMinutes: p.utcOffsetMinutes ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    mapsUrl: p.googleMapsUri ?? null,
    neighborhood: neighborhoodOf(p.addressComponents),
  };
}

export class GooglePlacesProvider implements PlacesProvider {
  constructor(private apiKey: string) {}

  private async request(path: string, mask: string, init?: RequestInit) {
    if (!this.apiKey) {
      throw new AppError(503, 'places_unavailable', 'Restaurant search is not configured');
    }
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': mask,
      },
      signal: AbortSignal.timeout(8000),
    });
    // Google answers 400 INVALID_ARGUMENT for malformed place ids; treat both as "no such place".
    if (res.status === 404 || (res.status === 400 && !init?.method)) return null;
    if (!res.ok) {
      throw new AppError(502, 'places_error', `Restaurant search failed (${res.status})`);
    }
    return res.json();
  }

  async search({ q, lat, lng }: { q: string; lat?: number; lng?: number }) {
    const body: Record<string, unknown> = { textQuery: q, includedType: 'restaurant', pageSize: 10 };
    if (lat !== undefined && lng !== undefined) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 20000 } };
    }
    const data = (await this.request('/places:searchText', SEARCH_MASK, {
      method: 'POST',
      body: JSON.stringify(body),
    })) as { places?: GooglePlace[] } | null;
    return (data?.places ?? []).map(toPlaceResult);
  }

  async get(googlePlaceId: string) {
    const data = (await this.request(
      `/places/${encodeURIComponent(googlePlaceId)}`,
      DETAILS_MASK,
    )) as GooglePlace | null;
    return data ? toPlaceDetails(data) : null;
  }
}
