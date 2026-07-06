import { Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';
import { S3StorageProvider } from './providers/s3-storage.provider.js';

@Module({
  providers: [StorageService, S3StorageProvider],
  exports: [StorageService],
})
export class StorageModule {}
