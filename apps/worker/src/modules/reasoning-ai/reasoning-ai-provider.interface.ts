import type {
  StructuredReasoningRequest,
  StructuredReasoningResult,
} from './reasoning-ai.types.js';

export const REASONING_AI_PROVIDER = Symbol('REASONING_AI_PROVIDER');
export const REASONING_AI_FETCH = Symbol('REASONING_AI_FETCH');

export interface ReasoningAiProvider {
  generateStructured(
    request: StructuredReasoningRequest,
  ): Promise<StructuredReasoningResult>;
}
