import type { PlaceResult } from '@tablemates/shared';

import { AppError } from '../lib/errors';
import type { PlacesProvider } from './types';

const BASE = 'https://places.googleapis.com/v1';
// Field masks keep requests in the cheapest SKU that has what we need.
const FIELDS = ['id', 'displayName', 'formattedAddress', 'location', 'priceLevel', 'types'];
const SEARCH_MASK = FIELDS.map((f) => `places.${f}`).join(',');
const DETAILS_MASK = FIELDS.join(',');

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  priceLevel?: string;
  types?: string[];
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
    return data ? toPlaceResult(data) : null;
  }
}
