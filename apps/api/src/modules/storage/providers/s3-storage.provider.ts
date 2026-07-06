import { Injectable } from '@nestjs/common';
import {
  StorageProvider,
  UploadedFileResult,
  UploadFileInput,
} from './storage-provider.interface.js';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.getRequiredEnv('S3_ENDPOINT');
    const region = this.getRequiredEnv('S3_REGION');
    this.bucket = this.getRequiredEnv('S3_BUCKET');
    this.publicBaseUrl = this.getRequiredEnv('S3_PUBLIC_BASE_URL');

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: this.getRequiredEnv('S3_ACCESS_KEY_ID'),
        secretAccessKey: this.getRequiredEnv('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle:
        this.configService.get<string>('S3_FORCE_PATH_STYLE') === 'true',
    });
  }

  async uploadFile(input: UploadFileInput): Promise<UploadedFileResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    return {
      key: input.key,
      url: `${this.publicBaseUrl.replace(/\/$/, '')}/${input.key}`,
    };
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) throw new Error(`${key} is not set`);

    return value;
  }
}
