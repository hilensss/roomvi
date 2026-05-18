import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { CatalogProductsQueryDto } from './dto/catalog-products-query.dto.js';
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async findProducts(query: CatalogProductsQueryDto) {
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (query.roomType) where.roomTypes = { has: query.roomType };
    if (query.style) where.styleTags = { has: query.style };
    if (query.category) where.category = query.category;
    if (query.stockStatus) where.stockStatus = query.stockStatus;
    if (query.minPrice || query.maxPrice)
      where.price = { gte: query.minPrice, lte: query.maxPrice };
    if (query.search)
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          supplier: {
            select: { id: true, name: true, slug: true, websiteUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, total, limit: query.limit, offset: query.offset };
  }
  async findProductById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, slug: true, websiteUrl: true },
        },
      },
    });
    if (!product || !product.isActive)
      throw new NotFoundException('Product not found');
    return product;
  }
}
