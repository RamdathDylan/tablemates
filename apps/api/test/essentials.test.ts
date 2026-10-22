import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { as, setupTestApp, signup } from './helpers';

const hours = {
  periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }],
  weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'],
};

describe('restaurant essentials', () => {
  const ctx = setupTestApp();

  it('stores hours, phone, website, maps link, and neighborhood when a restaurant is first logged', async () => {
    const alice = await signup(ctx.app, 'alice');
    ctx.places.add('luigi', "Luigi's", {
      hours,
      utcOffsetMinutes: -240,
      phone: '(212) 555-0100',
      website: 'https://luigis.example',
      mapsUrl: 'https://maps.google.com/?cid=1',
      neighborhood: 'West Village',
    });
    const visit = (await as(ctx.app, alice).post('/visits', { googlePlaceId: 'luigi', visitedAt: '2026-10-01' })).json();
    const { restaurant } = (await as(ctx.app, alice).get(`/restaurants/${visit.restaurant.id}`)).json();
    expect(restaurant).toMatchObject({
      hours,
      utcOffsetMinutes: -240,
      phone: '(212) 555-0100',
      website: 'https://luigis.example',
      mapsUrl: 'https://maps.google.com/?cid=1',
      neighborhood: 'West Village',
    });
  });

  it('fills in essentials for older restaurants the first time their page loads', async () => {
    const alice = await signup(ctx.app, 'alice');
    ctx.places.add('old', 'Old Spot');
    const visit = (await as(ctx.app, alice).post('/visits', { googlePlaceId: 'old', visitedAt: '2026-10-01' })).json();
    // Simulate a row saved before essentials existed, with Google now knowing the phone number.
    await ctx.db.execute(sql`update restaurants set details_fetched_at = null, phone = null`);
    ctx.places.add('old', 'Old Spot', { phone: '(212) 555-0199' });
    const calls = ctx.places.getCalls;

    const { restaurant } = (await as(ctx.app, alice).get(`/restaurants/${visit.restaurant.id}`)).json();
    expect(restaurant.phone).toBe('(212) 555-0199');
    expect(ctx.places.getCalls).toBe(calls + 1);
    // Cached afterwards: no second fetch.
    await as(ctx.app, alice).get(`/restaurants/${visit.restaurant.id}`);
    expect(ctx.places.getCalls).toBe(calls + 1);
  });
});
