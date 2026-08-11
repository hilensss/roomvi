import { Injectable } from '@nestjs/common';
import { InteriorStyle, Prisma, RoomType, StockStatus } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CatalogReadService {
  constructor(private readonly prisma: PrismaService) {}
  async findAiEligibleProducts(params: {
    roomType?: RoomType;
    style?: InteriorStyle;
    maxBudget?: number;
    supplierId?: string;
    limit?: number;
  }) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
      isAiEligible: true,
      stockStatus: StockStatus.IN_STOCK,
      imageUrls: { isEmpty: false },
    };
    if (params.supplierId) where.supplierId = params.supplierId;
    if (params.roomType) where.roomTypes = { has: params.roomType };
    if (params.style) where.styleTags = { has: params.style };
    if (params.maxBudget) where.price = { lte: params.maxBudget };
    return this.prisma.product.findMany({
      where,
      take: params.limit ?? 20,
      orderBy: { price: 'asc' },
    });
  }
}
