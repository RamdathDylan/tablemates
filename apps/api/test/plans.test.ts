import type { NotificationItem, Plan, PlanSummary } from '@tablemates/shared';
import { describe, expect, it } from 'vitest';

import { as, befriend, setupTestApp, signup, type TestUser } from './helpers';

describe('dinner plans', () => {
  const ctx = setupTestApp();
  const planOf = async (u: TestUser, id: string) => (await as(ctx.app, u).get(`/plans/${id}`)).json() as Plan;

  /** alice plans with bob and carol (both her friends); dave is a stranger. */
  async function world() {
    const [alice, bob, carol, dave] = await Promise.all(['alice', 'bob', 'carol', 'dave'].map((n) => signup(ctx.app, n)));
    await befriend(ctx.app, alice!, bob!);
    await befriend(ctx.app, alice!, carol!);
    ctx.places.add('luigi', "Luigi's");
    ctx.places.add('sushi', 'Sushi Zen');
    const { id } = (
      await as(ctx.app, alice!).post('/plans', {
        title: 'Friday dinner',
        startsAt: '2026-10-30T19:00:00-04:00',
        memberIds: [bob!.id, carol!.id],
      })
    ).json();
    return { alice: alice!, bob: bob!, carol: carol!, dave: dave!, planId: id as string };
  }

  it('creates a plan with invited friends and notifies them', async () => {
    const w = await world();
    const plans = (await as(ctx.app, w.bob).get('/plans')).json() as PlanSummary[];
    expect(plans.map((p) => [p.title, p.status, p.members.length])).toEqual([['Friday dinner', 'open', 3]]);
    const inbox = (await as(ctx.app, w.bob).get('/notifications')).json().items as NotificationItem[];
    expect(inbox.find((n) => n.type === 'plan_invite')).toMatchObject({ planId: w.planId, excerpt: 'Friday dinner', actor: { username: 'alice' } });
  });

  it('only invites friends, and hides plans from non-members', async () => {
    const w = await world();
    expect((await as(ctx.app, w.alice).post('/plans', { title: 'x', memberIds: [w.dave.id] })).statusCode).toBe(400);
    expect((await as(ctx.app, w.dave).get(`/plans/${w.planId}`)).statusCode).toBe(404);
    expect((await as(ctx.app, w.dave).post(`/plans/${w.planId}/options`, { googlePlaceId: 'luigi' })).statusCode).toBe(404);
  });

  it('collects options and votes, leaders first', async () => {
    const w = await world();
    const luigi = (await as(ctx.app, w.bob).post(`/plans/${w.planId}/options`, { googlePlaceId: 'luigi' })).json().id;
    const sushi = (await as(ctx.app, w.carol).post(`/plans/${w.planId}/options`, { googlePlaceId: 'sushi' })).json().id;
    expect((await as(ctx.app, w.carol).post(`/plans/${w.planId}/options`, { googlePlaceId: 'luigi' })).statusCode).toBe(409);
    // Suggesting counts as a vote; alice and carol also vote for Luigi's.
    await as(ctx.app, w.alice).put(`/plans/${w.planId}/options/${luigi}/vote`);
    await as(ctx.app, w.alice).put(`/plans/${w.planId}/options/${luigi}/vote`);
    await as(ctx.app, w.carol).put(`/plans/${w.planId}/options/${luigi}/vote`);

    const plan = await planOf(w.alice, w.planId);
    expect(plan.options.map((o) => [o.restaurant.name, o.voters.length, o.voted])).toEqual([
      ["Luigi's", 3, true],
      ['Sushi Zen', 1, false],
    ]);
    await as(ctx.app, w.carol).delete(`/plans/${w.planId}/options/${luigi}/vote`);
    expect((await planOf(w.carol, w.planId)).options.find((o) => o.id === luigi)!.voted).toBe(false);
    expect(sushi).toBeTruthy();
  });

  it('lets only the creator decide, then locks the plan and tells everyone', async () => {
    const w = await world();
    const luigi = (await as(ctx.app, w.bob).post(`/plans/${w.planId}/options`, { googlePlaceId: 'luigi' })).json().id;
    expect((await as(ctx.app, w.bob).post(`/plans/${w.planId}/decide`, { optionId: luigi })).statusCode).toBe(403);
    expect((await as(ctx.app, w.alice).post(`/plans/${w.planId}/decide`, { optionId: luigi })).statusCode).toBe(200);

    const plan = await planOf(w.carol, w.planId);
    expect(plan).toMatchObject({ status: 'decided', decided: { name: "Luigi's" } });
    expect((await as(ctx.app, w.carol).post(`/plans/${w.planId}/options`, { googlePlaceId: 'sushi' })).statusCode).toBe(400);
    expect((await as(ctx.app, w.carol).put(`/plans/${w.planId}/options/${luigi}/vote`)).statusCode).toBe(400);
    for (const u of [w.bob, w.carol]) {
      const inbox = (await as(ctx.app, u).get('/notifications')).json().items as NotificationItem[];
      expect(inbox.find((n) => n.type === 'plan_decided')).toMatchObject({ restaurant: { name: "Luigi's" }, excerpt: 'Friday dinner' });
    }
  });

  it('removes options (adder or creator only) and lets members leave', async () => {
    const w = await world();
    const luigi = (await as(ctx.app, w.bob).post(`/plans/${w.planId}/options`, { googlePlaceId: 'luigi' })).json().id;
    expect((await as(ctx.app, w.carol).delete(`/plans/${w.planId}/options/${luigi}`)).statusCode).toBe(403);
    expect((await as(ctx.app, w.alice).delete(`/plans/${w.planId}/options/${luigi}`)).statusCode).toBe(204);

    expect((await as(ctx.app, w.alice).post(`/plans/${w.planId}/leave`)).statusCode).toBe(400);
    expect((await as(ctx.app, w.carol).post(`/plans/${w.planId}/leave`)).statusCode).toBe(204);
    expect((await as(ctx.app, w.carol).get(`/plans/${w.planId}`)).statusCode).toBe(404);
  });
});
