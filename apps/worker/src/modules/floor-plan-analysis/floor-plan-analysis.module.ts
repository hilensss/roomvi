import { Module } from '@nestjs/common';
import { ReasoningAiModule } from '../reasoning-ai/reasoning-ai.module.js';
import { FloorPlanAnalyzerService } from './floor-plan-analyzer.service.js';
import { FloorPlanAnalysisService } from './floor-plan-analysis.service.js';
import { FloorPlanAssetService } from './floor-plan-asset.service.js';

@Module({
  imports: [ReasoningAiModule],
  providers: [
    FloorPlanAnalyzerService,
    FloorPlanAssetService,
    FloorPlanAnalysisService,
  ],
  exports: [FloorPlanAnalyzerService, FloorPlanAnalysisService],
})
export class FloorPlanAnalysisModule {}
