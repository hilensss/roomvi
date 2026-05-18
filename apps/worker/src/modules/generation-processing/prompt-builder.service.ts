import { Injectable } from '@nestjs/common';
import { InteriorStyle, Product, RoomType } from '@roomvi/database';
type PromptInput = {
  roomType: RoomType;
  style: InteriorStyle;
  title?: string;
  budgetMin?: number;
  budgetMax?: number;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  sourceImageUrl?: string;
};
@Injectable()
export class PromptBuilderService {
  buildPrompt(dto: PromptInput, products: Product[]) {
    const productLines = products
      .slice(0, 12)
      .map(
        (p) =>
          `- ${p.title}, category: ${p.category}, color: ${p.color ?? 'unknown'}, material: ${p.material ?? 'unknown'}`,
      )
      .join('\n');
    return [
      `Create a photorealistic interior design for a ${dto.roomType}.`,
      `Interior style: ${dto.style}.`,
      dto.budgetMax ? `Maximum furniture budget: ${dto.budgetMax} RUB.` : null,
      dto.sourceImageUrl
        ? `Use source room image as layout reference: ${dto.sourceImageUrl}.`
        : null,
      'Use furniture and decor inspired by these real catalog products:',
      productLines,
      'The result should look realistic, cozy, commercially attractive, and suitable for an online furniture marketplace.',
    ]
      .filter(Boolean)
      .join('\n');
  }
  buildNegativePrompt() {
    return [
      'low quality',
      'distorted furniture',
      'unrealistic geometry',
      'extra doors',
      'broken perspective',
      'messy room',
      'dark unusable lighting',
      'watermark',
      'text',
      'logo',
    ].join(', ');
  }
}
