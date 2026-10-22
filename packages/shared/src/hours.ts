/** Opening hours as Google Places reports them (day 0 = Sunday). */
export interface OpeningHours {
  periods: { open: HoursPoint; close?: HoursPoint }[];
  /** e.g. "Monday: 11:00 AM – 10:00 PM", Monday first. */
  weekdayDescriptions: string[];
}

export interface HoursPoint {
  day: number;
  hour: number;
  minute: number;
}

export interface OpenStatus {
  open: boolean;
  /** "Open · closes 10 PM", "Closed · opens 11 AM Tue", "Open 24 hours". */
  label: string;
}

const WEEK = 7 * 24 * 60;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const minuteOfWeek = (p: HoursPoint) => p.day * 24 * 60 + p.hour * 60 + p.minute;

function clock(p: HoursPoint) {
  const h = p.hour % 12 || 12;
  const m = p.minute ? `:${String(p.minute).padStart(2, '0')}` : '';
  return `${h}${m} ${p.hour < 12 ? 'AM' : 'PM'}`;
}

/**
 * Whether a restaurant is open at `now`, in the restaurant's own time zone.
 * Returns null when hours are unknown.
 */
export function openStatus(
  hours: OpeningHours | null | undefined,
  utcOffsetMinutes: number | null | undefined,
  now: Date = new Date(),
): OpenStatus | null {
  if (!hours?.periods.length || utcOffsetMinutes == null) return null;

  // Google uses a single period with no close for "open 24 hours".
  if (hours.periods.length === 1 && !hours.periods[0]!.close) return { open: true, label: 'Open 24 hours' };

  const local = new Date(now.getTime() + utcOffsetMinutes * 60_000);
  const nowMin = local.getUTCDay() * 24 * 60 + local.getUTCHours() * 60 + local.getUTCMinutes();

  for (const { open, close } of hours.periods) {
    if (!close) continue;
    const start = minuteOfWeek(open);
    let end = minuteOfWeek(close);
    if (end <= start) end += WEEK; // closes after midnight Saturday → Sunday
    const t = nowMin < start ? nowMin + WEEK : nowMin;
    if (t >= start && t < end) return { open: true, label: `Open · closes ${clock(close)}` };
  }

  // Closed: find the next opening time.
  const next = hours.periods
    .map((p) => p.open)
    .map((o) => ({ o, wait: (minuteOfWeek(o) - nowMin + WEEK) % WEEK }))
    .sort((a, b) => a.wait - b.wait)[0];
  if (!next) return { open: false, label: 'Closed' };
  const sameDay = next.o.day === local.getUTCDay() && next.wait < 24 * 60;
  return { open: false, label: `Closed · opens ${clock(next.o)}${sameDay ? '' : ` ${DAYS[next.o.day]}`}` };
}
