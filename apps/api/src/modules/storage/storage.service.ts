import { Injectable } from '@nestjs/common';
import { S3StorageProvider } from './providers/s3-storage.provider.js';
import { UploadFileInput } from './providers/storage-provider.interface.js';

@Injectable()
export class StorageService {
  constructor(private readonly s3StorageProvider: S3StorageProvider) {}

  async uploadFile(input: UploadFileInput) {
    return await this.s3StorageProvider.uploadFile(input);
  }
}
