export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Sends transactional email. Swappable so tests and local dev never send real mail. */
export interface Mailer {
  send(email: Email): Promise<void>;
}
