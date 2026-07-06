import { Module } from '@nestjs/common';
import { FilesService } from './files.service.js';
import { FilesController } from './files.controller.js';
import { GuestModule } from '../guest/guest.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [GuestModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
