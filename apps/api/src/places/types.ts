import type { PlaceResult } from '@tablemates/shared';

/** Restaurant lookup. Swappable so tests don't call Google. */
export interface PlacesProvider {
  search(query: { q: string; lat?: number; lng?: number }): Promise<PlaceResult[]>;
  /** Returns null when the place doesn't exist. */
  get(googlePlaceId: string): Promise<PlaceResult | null>;
}
