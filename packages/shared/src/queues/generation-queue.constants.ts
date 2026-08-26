export const GENERATION_QUEUE_NAME = 'generation';
export const GENERATION_QUEUE_JOBS = {
  PROCESS_GENERATION: 'process-generation',
  ANALYZE_FLOOR_PLAN: 'analyze-floor-plan',
} as const;

export type ProcessGenerationJobPayload = {
  generationJobId: string;
};

export type AnalyzeFloorPlanJobPayload = {
  analysisRunId: string;
};

export type GenerationQueuePayload =
  | ProcessGenerationJobPayload
  | AnalyzeFloorPlanJobPayload;
