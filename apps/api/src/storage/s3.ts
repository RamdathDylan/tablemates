import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type { Storage } from './types';

export interface S3Config {
  endpoint: string;
  /** Host clients reach, if different (e.g. a LAN address in development). Signed URLs use it. */
  publicEndpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Works with Cloudflare R2 and any S3-compatible store (RustFS locally). */
export class S3Storage implements Storage {
  private client: S3Client;
  private signer: S3Client;

  constructor(private config: S3Config) {
    const base = {
      region: config.region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    };
    this.client = new S3Client({ ...base, endpoint: config.endpoint });
    // Signatures cover the host, so URLs handed to clients are signed for the public endpoint.
    this.signer = new S3Client({ ...base, endpoint: config.publicEndpoint });
  }

  presignPut(key: string, contentType: string, bytes: number, expiresSec = 600) {
    return getSignedUrl(
      this.signer,
      new PutObjectCommand({ Bucket: this.config.bucket, Key: key, ContentType: contentType, ContentLength: bytes }),
      { expiresIn: expiresSec },
    );
  }

  presignGet(key: string, expiresSec = 3600) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.config.bucket, Key: key }), { expiresIn: expiresSec });
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
      return { bytes: res.ContentLength ?? 0 };
    } catch (err) {
      if ((err as { name?: string }).name === 'NotFound' || (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async delete(keys: string[]) {
    if (!keys.length) return;
    await this.client.send(
      new DeleteObjectsCommand({ Bucket: this.config.bucket, Delete: { Objects: keys.map((Key) => ({ Key })) } }),
    );
  }

  async ensureReady(corsOrigins: string[]) {
    const Bucket = this.config.bucket;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket }));
    }
    await this.client.send(
      new PutBucketCorsCommand({
        Bucket,
        CORSConfiguration: {
          CORSRules: [{ AllowedOrigins: corsOrigins, AllowedMethods: ['PUT', 'GET'], AllowedHeaders: ['*'], MaxAgeSeconds: 3600 }],
        },
      }),
    );
  }
}
