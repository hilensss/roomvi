import { Injectable } from '@nestjs/common';
import { Product } from '@roomvi/database';
import {
  AiProvider,
  GenerateDesignInput,
  GeneratedDesignVariant,
} from './ai-provider.interface.js';
@Injectable()
export class MockAiProvider implements AiProvider {
  providerName = 'MOCK';
  async generateDesigns(
    input: GenerateDesignInput,
  ): Promise<GeneratedDesignVariant[]> {
    const products = input.products;
    return Array.from({ length: input.variantsCount }).map((_, index) => {
      const shifted = this.pickProductsForVariant(products, index);
      return {
        title: `Вариант ${index + 1}`,
        description: `Mock-дизайн комнаты в стиле ${input.style}.`,
        imageUrl: this.createMockImageUrl(
          input.roomType,
          input.style,
          index + 1,
        ),
        productIds: shifted.map((p) => p.id),
      };
    });
  }
  private pickProductsForVariant(products: Product[], index: number) {
    if (products.length <= 5) return products;
    const start = index % products.length;
    return Array.from({ length: Math.min(5, products.length) }).map(
      (_, i) => products[(start + i) % products.length],
    );
  }
  private createMockImageUrl(
    roomType: string,
    style: string,
    variantNumber: number,
  ) {
    const text = encodeURIComponent(`${roomType} ${style} v${variantNumber}`);
    return `https://placehold.co/1280x900?text=${text}`;
  }
}
