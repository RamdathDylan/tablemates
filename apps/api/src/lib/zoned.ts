/** Time-zone math with the built-in Intl API (no date library). */

/** Minutes the zone is ahead of UTC at a given instant (e.g. -240 for New York in summer). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** "2026-10-22" in the given zone. */
export function localDate(timeZone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** The UTC instant of a wall-clock time on a local date in a zone (handles DST). */
export function zonedTimeToUtc(date: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  let instant = guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000;
  // Re-check once in case the guess and the answer straddle a DST change.
  instant = guess - zoneOffsetMinutes(timeZone, new Date(instant)) * 60_000;
  return new Date(instant);
}
