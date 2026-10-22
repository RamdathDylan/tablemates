export interface PushMessage {
  to: string;
  title: string;
  body: string;
  /** Read by the app to deep-link when the notification is tapped. */
  data: Record<string, string>;
}

export type PushResult = { ok: true } | { ok: false; deviceGone: boolean };

/** Delivers push notifications. Swappable so tests never call Expo. */
export interface PushProvider {
  send(messages: PushMessage[]): Promise<PushResult[]>;
}
