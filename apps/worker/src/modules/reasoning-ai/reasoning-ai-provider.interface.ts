import type {
  StructuredReasoningRequest,
  StructuredReasoningResult,
} from './reasoning-ai.types.js';

export const REASONING_AI_PROVIDER = Symbol('REASONING_AI_PROVIDER');
export const REASONING_AI_FETCH = Symbol('REASONING_AI_FETCH');

export class ReasoningAiProviderError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ReasoningAiProviderError';
  }
}

export interface ReasoningAiProvider {
  generateStructured(
    request: StructuredReasoningRequest,
  ): Promise<StructuredReasoningResult>;
}
