import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CatalogProductsQueryDto,
  CatalogProductsSort,
} from './dto/catalog-products-query.dto.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}
  async findProducts(query: CatalogProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      isActive: true,
    };

    if (query.search) {
      where.OR = [
        {
          title: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          description: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (query.category?.length) {
      where.category = {
        in: query.category,
      };
    }

    if (query.style?.length) {
      where.styleTags = {
        hasSome: query.style,
      };
    }

    if (query.roomType?.length) {
      where.roomTypes = {
        hasSome: query.roomType,
      };
    }

    if (query.stockStatus?.length) {
      where.stockStatus = {
        in: query.stockStatus,
      };
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          supplier: {
            select: { id: true, name: true, slug: true, websiteUrl: true },
          },
        },
        orderBy: this.getProductsOrderBy(query.sort),
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

  private getProductsOrderBy(sort?: CatalogProductsSort) {
    switch (sort) {
      case CatalogProductsSort.PRICE_ASC:
        return [{ price: 'asc' as const }];

      case CatalogProductsSort.PRICE_DESC:
        return [{ price: 'desc' as const }];

      case CatalogProductsSort.NEW:
        return [{ createdAt: 'desc' as const }];

      case CatalogProductsSort.POPULAR:

      default:
        return [{ updatedAt: 'desc' as const }, { createdAt: 'desc' as const }];
    }
  }
}
