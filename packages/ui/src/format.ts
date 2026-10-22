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

/** "now", "5m", "3h", "2d", then a date. Compact, for activity rows. */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return formatDate(iso);
}

/** "Bob", "Bob and Carol", "Bob, Carol and 2 others". */
export function joinNames(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}
