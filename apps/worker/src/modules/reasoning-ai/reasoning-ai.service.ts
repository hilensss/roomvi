import { Inject, Injectable } from '@nestjs/common';
import {
  REASONING_AI_PROVIDER,
  type ReasoningAiProvider,
} from './reasoning-ai-provider.interface.js';
import type {
  StructuredReasoningRequest,
  StructuredReasoningResult,
} from './reasoning-ai.types.js';

@Injectable()
export class ReasoningAiService {
  constructor(
    @Inject(REASONING_AI_PROVIDER)
    private readonly provider: ReasoningAiProvider,
  ) {}

  generateStructured(
    request: StructuredReasoningRequest,
  ): Promise<StructuredReasoningResult> {
    return this.provider.generateStructured(request);
  }
}
