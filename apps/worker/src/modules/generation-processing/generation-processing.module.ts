import { Module } from '@nestjs/common';
import { CatalogReadModule } from '../catalog/catalog-read.module.js';
import { GenerationProcessingService } from './generation-processing.service.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { CatalogReadService } from '../catalog/catalog-read.service.js';
import { AiProviderFactory } from './providers/ai-provider.factory.js';
import { YesAiNanoBananaProvider } from './providers/yes-ai-nano-banana.provider.js';
import { StorageModule } from '../storage/storage.module.js';
import { AiReferenceImageCacheService } from './services/ai-reference-image-cache.service.js';
import { ProductMatchingService } from './product-matching.service.js';
import { DeveloperRoomGenerationService } from './developer-room-generation.service.js';
import { RoomShellRendererService } from './room-shell-renderer.service.js';
import { ReasoningAiModule } from '../reasoning-ai/reasoning-ai.module.js';
import { ProductCurationService } from './product-curation.service.js';
import { RoomSpatialProfileService } from './room-spatial-profile.service.js';
import { SceneBlueprintService } from './scene-blueprint.service.js';

@Module({
  imports: [CatalogReadModule, StorageModule, ReasoningAiModule],
  providers: [
    GenerationProcessingService,
    PromptBuilderService,
    CatalogReadService,
    MockAiProvider,
    AiReferenceImageCacheService,
    YesAiNanoBananaProvider,
    AiProviderFactory,
    ProductMatchingService,
    RoomShellRendererService,
    RoomSpatialProfileService,
    SceneBlueprintService,
    ProductCurationService,
    DeveloperRoomGenerationService,
  ],
  exports: [GenerationProcessingService],
})
export class GenerationProcessingModule {}
