import { openStatus, type OpeningHours } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

// Tue–Sun 11:00–22:00, Fri & Sat until 1:00 AM, closed Monday.
const hours: OpeningHours = {
  weekdayDescriptions: [],
  periods: [0, 2, 3, 4, 5, 6].map((day) => ({
    open: { day, hour: 11, minute: 0 },
    close: day === 5 || day === 6 ? { day: (day + 1) % 7, hour: 1, minute: 0 } : { day, hour: 22, minute: 0 },
  })),
};
const NY = -240; // EDT

/** A UTC instant for a New York local time. Oct 2026: the 25th is a Sunday. */
const at = (day: number, hh: number, mm = 0) =>
  new Date(Date.UTC(2026, 9, 25 + day, hh, mm) - NY * 60_000);

describe('openStatus', () => {
  it('is open mid-shift with the closing time', () => {
    expect(openStatus(hours, NY, at(2, 13))).toEqual({ open: true, label: 'Open · closes 10 PM' });
  });

  it('handles service past midnight, including Saturday into Sunday', () => {
    expect(openStatus(hours, NY, at(6, 0, 30))).toEqual({ open: true, label: 'Open · closes 1 AM' }); // Sat 12:30 AM (Fri night)
    expect(openStatus(hours, NY, at(7, 0, 30))).toEqual({ open: true, label: 'Open · closes 1 AM' }); // Sun 12:30 AM (Sat night)
  });

  it('says when it opens next, naming the day when it is not today', () => {
    expect(openStatus(hours, NY, at(2, 9))).toEqual({ open: false, label: 'Closed · opens 11 AM' });
    expect(openStatus(hours, NY, at(1, 12))).toEqual({ open: false, label: 'Closed · opens 11 AM Tue' }); // closed Mondays
    expect(openStatus(hours, NY, at(2, 23))).toEqual({ open: false, label: 'Closed · opens 11 AM Wed' });
  });

  it('uses the restaurant time zone, not the device', () => {
    // 1 PM in New York is 10 AM in Los Angeles: same instant, different answer.
    const instant = at(2, 13);
    expect(openStatus(hours, -420, instant)?.open).toBe(false);
  });

  it('handles 24-hour places and unknown hours', () => {
    expect(openStatus({ weekdayDescriptions: [], periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }, NY)).toEqual({
      open: true,
      label: 'Open 24 hours',
    });
    expect(openStatus(null, NY)).toBeNull();
    expect(openStatus(hours, null)).toBeNull();
  });
});
