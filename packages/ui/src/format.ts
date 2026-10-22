/** "$$" for price level 2. Google's level 0 means free. */
export function priceLabel(level: number | null | undefined): string | null {
  if (level === null || level === undefined) return null;
  return level === 0 ? 'Free' : '$'.repeat(level);
}

/** "Oct 1, 2026" from an ISO date or date-time string. */
export function formatDate(iso: string): string {
  // Date-only strings parse as UTC; pin to noon so the day never shifts across time zones.
  const date = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
