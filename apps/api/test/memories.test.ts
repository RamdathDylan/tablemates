import type { Memory } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { monthsBefore } from '../src/routes/memories';
import { as, befriend, setupTestApp, signup } from './helpers';

describe('on this day', () => {
  const ctx = setupTestApp();

  it('steps back whole months, clamping to the end of shorter months', () => {
    expect(monthsBefore('2026-10-22', 1)).toBe('2026-09-22');
    expect(monthsBefore('2026-10-22', 6)).toBe('2026-04-22');
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28');
    expect(monthsBefore('2026-01-15', 6)).toBe('2025-07-15');
  });

  it('shows your visits on this date in earlier years, with companions, and nobody else’s', async () => {
    const [maya, bob] = await Promise.all(['maya', 'bob'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, maya!, bob!);
    ctx.places.add('joes', "Joe's Pizza");
    ctx.places.add('ramen', 'Ramen Bar');
    await as(ctx.app, maya!).post('/visits', { googlePlaceId: 'joes', visitedAt: '2025-10-22', companionIds: [bob!.id], review: { rating: 5, recommends: true } });
    await as(ctx.app, maya!).post('/visits', { googlePlaceId: 'ramen', visitedAt: '2023-10-22', audience: 'private' });
    await as(ctx.app, maya!).post('/visits', { googlePlaceId: 'ramen', visitedAt: '2025-10-21' });
    await as(ctx.app, bob!).post('/visits', { googlePlaceId: 'ramen', visitedAt: '2024-10-22' });

    const memories = (await as(ctx.app, maya!).get('/memories?date=2026-10-22')).json() as Memory[];
    expect(memories.map((m) => [m.label, m.restaurant.name, m.rating, m.companions.map((c) => c.username)])).toEqual([
      ['1 year ago', "Joe's Pizza", 5, ['bob']],
      ['3 years ago', 'Ramen Bar', null, []],
    ]);
  });

  it('falls back to a month or six months ago, and is empty otherwise', async () => {
    const maya = await signup(ctx.app, 'maya');
    ctx.places.add('joes', "Joe's Pizza");
    expect((await as(ctx.app, maya).get('/memories?date=2026-10-22')).json()).toEqual([]);
    await as(ctx.app, maya).post('/visits', { googlePlaceId: 'joes', visitedAt: '2026-04-22' });
    expect(((await as(ctx.app, maya).get('/memories?date=2026-10-22')).json() as Memory[]).map((m) => m.label)).toEqual(['6 months ago']);
    await as(ctx.app, maya).post('/visits', { googlePlaceId: 'joes', visitedAt: '2026-09-22' });
    expect(((await as(ctx.app, maya).get('/memories?date=2026-10-22')).json() as Memory[]).map((m) => m.label)).toEqual(['1 month ago']);
  });
});
