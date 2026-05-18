import { Product } from '@roomvi/database';
export type GenerateDesignInput = {
  prompt: string;
  negativePrompt?: string;
  roomType: string;
  style: string;
  products: Product[];
  variantsCount: number;
  sourceImageUrl?: string;
};
export type GeneratedDesignVariant = {
  title: string;
  description: string;
  imageUrl: string;
  productIds: string[];
};
export interface AiProvider {
  providerName: string;
  generateDesigns(
    input: GenerateDesignInput,
  ): Promise<GeneratedDesignVariant[]>;
}
