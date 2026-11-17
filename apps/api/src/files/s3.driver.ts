import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { assertSafeKey, type StorageDriver } from './storage.js';

export interface S3Settings {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Railway buckets use virtual-hosted URLs (false). Some local S3 emulators need path style (true). */
  forcePathStyle: boolean;
}

/** Any S3-compatible private bucket. Configured entirely from S3_* environment variables. */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  readonly client: S3Client;

  constructor(private readonly s: S3Settings) {
    this.client = new S3Client({
      endpoint: s.endpoint,
      region: s.region,
      forcePathStyle: s.forcePathStyle,
      credentials: { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.s.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.s.bucket, Key: key }));
    if (!res.Body) throw new Error(`Empty object: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.s.bucket, Key: key }));
  }

  presignedGetUrl(
    key: string,
    opts: { expiresIn: number; filename: string; contentType: string },
  ): Promise<string> {
    assertSafeKey(key);
    const command = new GetObjectCommand({
      Bucket: this.s.bucket,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: `inline; filename="${opts.filename.replace(/[^\w.\- ]/g, '_')}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: opts.expiresIn });
  }
}
