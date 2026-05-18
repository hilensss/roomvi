import { Module } from '@nestjs/common';
import { GenerationQueueModule } from '../generation-queue/generation-queue.module.js';
import { GuestModule } from '../guest/guest.module.js';
import { GenerationApiService } from './generation-api.service.js';
import { GenerationController } from './generation.controller.js';
@Module({
  imports: [GuestModule, GenerationQueueModule],
  controllers: [GenerationController],
  providers: [GenerationApiService],
})
export class GenerationModule {}
