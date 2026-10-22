import { notificationSettingsInput, registerPushTokenInput, type NotificationSettings } from '@tablemates/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { pushTokens, users } from '../db/schema';
import type { Deps } from '../deps';
import { parse } from '../lib/errors';

export function pushRoutes(app: FastifyInstance, { db }: Deps) {
  /** Called by the app after it gets an Expo push token. A token moves to the newest signed-in user. */
  app.post('/me/push-tokens', async (req, reply) => {
    const { token, platform } = parse(registerPushTokenInput, req.body);
    await db
      .insert(pushTokens)
      .values({ token, platform, userId: req.userId })
      .onConflictDoUpdate({ target: pushTokens.token, set: { userId: req.userId, platform } });
    return reply.status(204).send();
  });

  /** Called on sign-out so the device stops receiving this account's pushes. */
  app.delete('/me/push-tokens/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    await db.delete(pushTokens).where(and(eq(pushTokens.token, token), eq(pushTokens.userId, req.userId)));
    return reply.status(204).send();
  });

  app.get('/me/notification-settings', async (req): Promise<NotificationSettings> => {
    const [row] = await db.select({ muted: users.mutedPushTypes }).from(users).where(eq(users.id, req.userId));
    return { mutedPush: (row?.muted ?? []) as NotificationSettings['mutedPush'] };
  });

  app.patch('/me/notification-settings', async (req): Promise<NotificationSettings> => {
    const { mutedPush } = parse(notificationSettingsInput, req.body);
    await db.update(users).set({ mutedPushTypes: mutedPush }).where(eq(users.id, req.userId));
    return { mutedPush };
  });
}
