import type { Email, Mailer } from './types';

/** Production delivery through Resend's HTTP API. */
export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
  ) {}

  async send({ to, subject, html, text }: Email) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${await res.text()}`);
  }
}

/** Local development: delivers to the Mailpit inbox from docker-compose (http://localhost:8025). */
export class MailpitMailer implements Mailer {
  constructor(
    private baseUrl: string,
    private from: string,
  ) {}

  async send({ to, subject, html, text }: Email) {
    const match = /^(.*)<(.+)>$/.exec(this.from);
    const from = match ? { Name: match[1]!.trim(), Email: match[2]!.trim() } : { Email: this.from };
    const res = await fetch(`${this.baseUrl}/api/v1/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: from, To: [{ Email: to }], Subject: subject, HTML: html, Text: text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`Mailpit rejected the email (${res.status}). Is it running? (pnpm db:up)`);
  }
}
