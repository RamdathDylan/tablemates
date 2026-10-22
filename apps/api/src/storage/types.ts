/** Object storage for photos. Swappable so tests never touch S3/R2. */
export interface Storage {
  /** A URL the client can PUT the file to directly. */
  presignPut(key: string, contentType: string, bytes: number, expiresSec?: number): Promise<string>;
  /** A short-lived URL to read a private object. */
  presignGet(key: string, expiresSec?: number): Promise<string>;
  /** Size of an uploaded object, or null if it isn't there. */
  head(key: string): Promise<{ bytes: number } | null>;
  delete(keys: string[]): Promise<void>;
  /** Creates the bucket if needed and allows browser uploads from these origins. */
  ensureReady(corsOrigins: string[]): Promise<void>;
}
