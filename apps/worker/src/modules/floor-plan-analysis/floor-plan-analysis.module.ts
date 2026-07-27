import { Module } from '@nestjs/common';
import { ReasoningAiModule } from '../reasoning-ai/reasoning-ai.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { FloorPlanAnalyzerService } from './floor-plan-analyzer.service.js';
import { FloorPlanAnalysisService } from './floor-plan-analysis.service.js';
import { FloorPlanAssetService } from './floor-plan-asset.service.js';

@Module({
  imports: [ReasoningAiModule, StorageModule],
  providers: [
    FloorPlanAnalyzerService,
    FloorPlanAssetService,
    FloorPlanAnalysisService,
  ],
  exports: [FloorPlanAnalyzerService, FloorPlanAnalysisService],
})
export class FloorPlanAnalysisModule {}
