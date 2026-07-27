import { Module } from '@nestjs/common';
import { OpenAiReasoningProvider } from './openai-reasoning.provider.js';
import { REASONING_AI_PROVIDER } from './reasoning-ai-provider.interface.js';
import { ReasoningAiService } from './reasoning-ai.service.js';

@Module({
  providers: [
    OpenAiReasoningProvider,
    {
      provide: REASONING_AI_PROVIDER,
      useExisting: OpenAiReasoningProvider,
    },
    ReasoningAiService,
  ],
  exports: [ReasoningAiService],
})
export class ReasoningAiModule {}
