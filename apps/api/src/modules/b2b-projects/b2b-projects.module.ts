import { Module } from '@nestjs/common';
import { GenerationQueueModule } from '../generation-queue/generation-queue.module.js';
import { B2BProjectsController } from './b2b-projects.controller.js';
import { B2BProjectsService } from './b2b-projects.service.js';
import { ManagerGuard } from './guards/manager.guard.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [GenerationQueueModule, StorageModule],
  controllers: [B2BProjectsController],
  providers: [B2BProjectsService, ManagerGuard],
})
export class B2BProjectsModule {}
