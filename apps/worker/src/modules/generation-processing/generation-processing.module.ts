import { Module } from '@nestjs/common';
import { CatalogReadModule } from '../catalog/catalog-read.module.js';
import { GenerationProcessingService } from './generation-processing.service.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { PromptBuilderService } from './prompt-builder.service.js';
@Module({
  imports: [CatalogReadModule],
  providers: [
    GenerationProcessingService,
    PromptBuilderService,
    MockAiProvider,
  ],
  exports: [GenerationProcessingService],
})
export class GenerationProcessingModule {}
