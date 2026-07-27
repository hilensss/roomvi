import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

type UploadBufferInput = {
  buffer: Buffer;
  contentType: string;
  folder: string;
  extension?: string;
  key?: string;
};

@Injectable()
export class StorageService {
  private readonly client = new S3Client({
    region: process.env.S3_REGION ?? 'ru-central1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: this.getRequiredEnv('S3_ACCESS_KEY_ID'),
      secretAccessKey: this.getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    },
  });

  private readonly bucket = this.getRequiredEnv('S3_BUCKET');
  private readonly publicBaseUrl = this.getRequiredEnv('S3_PUBLIC_BASE_URL');

  async uploadBuffer(input: UploadBufferInput) {
    const extension =
      input.extension ?? this.getExtensionFromContentType(input.contentType);

    const key = input.key ?? `${input.folder}/${randomUUID()}.${extension}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return {
      key,
      url: this.getPublicUrl(key),
    };
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      return true;
    } catch (error) {
      const statusCode = (
        error as { $metadata?: { httpStatusCode?: number } }
      ).$metadata?.httpStatusCode;

      if (statusCode === 404) {
        return false;
      }

      throw error;
    }
  }

  async downloadBuffer(key: string, maxBytes: number, timeoutMs = 10_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
        { abortSignal: controller.signal },
      );
      if (
        response.ContentLength !== undefined &&
        response.ContentLength > maxBytes
      ) {
        throw new Error('Stored object exceeds the download limit');
      }
      if (!response.Body) {
        throw new Error('Stored object has no body');
      }

      const chunks: Buffer[] = [];
      let receivedBytes = 0;
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        const buffer = Buffer.from(chunk);
        receivedBytes += buffer.length;
        if (receivedBytes > maxBytes) {
          throw new Error('Stored object exceeds the download limit');
        }
        chunks.push(buffer);
      }
      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timeout);
    }
  }

  getPublicUrl(key: string): string {
    const normalizedKey = key.replace(/^\/+/, '');

    return `${this.publicBaseUrl.replace(/\/$/, '')}/${normalizedKey}`;
  }

  private getExtensionFromContentType(contentType: string) {
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    if (contentType.includes('jpeg')) return 'jpg';
    if (contentType.includes('jpg')) return 'jpg';

    return 'png';
  }

  private getRequiredEnv(name: string) {
    const value = process.env[name];

    if (!value) {
      throw new Error(`${name} is not configured`);
    }

    return value;
  }
}
