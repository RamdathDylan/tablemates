import type { PushMessage, PushProvider, PushResult } from './types';

const ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo's per-request limit

/** Expo's push service, which relays to APNs and FCM. */
export class ExpoPushProvider implements PushProvider {
  constructor(private accessToken?: string) {}

  async send(messages: PushMessage[]): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const batch = messages.slice(i, i + BATCH);
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
        },
        body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Expo push failed (${res.status})`);
      const { data } = (await res.json()) as {
        data: { status: 'ok' | 'error'; details?: { error?: string } }[];
      };
      for (const ticket of data) {
        results.push(
          ticket.status === 'ok' ? { ok: true } : { ok: false, deviceGone: ticket.details?.error === 'DeviceNotRegistered' },
        );
      }
    }
    return results;
  }
}
