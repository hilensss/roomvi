import { Injectable } from '@nestjs/common';
import { MockAiProvider } from './mock-ai.provider.js';
import { GenerationProvider } from '@roomvi/database';
import { AiProvider } from './ai-provider.interface.js';
import { YesAiNanoBananaProvider } from './yes-ai-nano-banana.provider.js';

@Injectable()
export class AiProviderFactory {
  constructor(
    private readonly mockAiProvider: MockAiProvider,
    private readonly yesAiNanoBananaProvider: YesAiNanoBananaProvider,
  ) {}

  getProvider(provider: GenerationProvider): AiProvider {
    switch (provider) {
      case GenerationProvider.MOCK:
        return this.mockAiProvider;

      case GenerationProvider.NANO_BANANA:
        return this.yesAiNanoBananaProvider;

      default:
        throw new Error(`Unsupported generation provider: ${provider}`);
    }
  }
}
