import { InteriorStyle, Product, RoomType } from '@roomvi/database';

export type AiProviderName = 'MOCK' | 'NANO_BANANA';

export type AiGenerationProgress = {
  progress: number;
  currentStep: string;
  externalJobId?: string;
};

export type GenerateDesignInput = {
  prompt: string;
  negativePrompt?: string;
  roomType: RoomType;
  style: InteriorStyle;
  products: Product[];
  variantsCount: number;
  sourceImageUrl?: string;
  sourceShell?: boolean;
  b2bRoomId?: string;
  customerId: string;
  onProgress?: (progress: AiGenerationProgress) => Promise<void> | void;
};

export type GeneratedDesignVariant = {
  title: string;
  description?: string;
  imageUrl: string;
  productIds: string[];
};

export interface AiProvider {
  providerName: AiProviderName;

  generateDesigns(
    input: GenerateDesignInput,
  ): Promise<GeneratedDesignVariant[]>;
}
