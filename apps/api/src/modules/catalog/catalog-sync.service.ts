import { Injectable } from '@nestjs/common';
import { SupplierProductRawStatus, SupplierStatus } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { normalizeMockProduct } from './normalizers/mock-product.normalizer.js';
import { MockSupplierAdapter } from './suppliers/mock-supplier.adapter.js';
import { hashPayload } from './utils/hash-payload.util.js';
@Injectable()
export class CatalogSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mockSupplierAdapter: MockSupplierAdapter,
  ) {}
  async syncMockSupplier() {
    const supplier = await this.prisma.supplier.upsert({
      where: { slug: this.mockSupplierAdapter.supplierSlug },
      update: {
        name: this.mockSupplierAdapter.supplierName,
        status: SupplierStatus.ACTIVE,
      },
      create: {
        slug: this.mockSupplierAdapter.supplierSlug,
        name: this.mockSupplierAdapter.supplierName,
        status: SupplierStatus.ACTIVE,
      },
    });
    const supplierProducts = await this.mockSupplierAdapter.fetchProducts();
    let rawUpserted = 0,
      productsUpserted = 0;
    for (const supplierProduct of supplierProducts) {
      const rawProduct = await this.prisma.supplierProductRaw.upsert({
        where: {
          supplierId_externalId: {
            supplierId: supplier.id,
            externalId: supplierProduct.externalId,
          },
        },
        update: {
          title: supplierProduct.title,
          url: supplierProduct.productUrl,
          rawPayload: supplierProduct.rawPayload as object,
          payloadHash: hashPayload(supplierProduct.rawPayload),
          status: SupplierProductRawStatus.ACTIVE,
          lastSeenAt: new Date(),
        },
        create: {
          supplierId: supplier.id,
          externalId: supplierProduct.externalId,
          title: supplierProduct.title,
          url: supplierProduct.productUrl,
          rawPayload: supplierProduct.rawPayload as object,
          payloadHash: hashPayload(supplierProduct.rawPayload),
          status: SupplierProductRawStatus.ACTIVE,
          lastSeenAt: new Date(),
        },
      });
      rawUpserted++;
      await this.prisma.product.upsert({
        where: {
          supplierId_externalId: {
            supplierId: supplier.id,
            externalId: supplierProduct.externalId,
          },
        },
        update: {
          rawProductId: rawProduct.id,
          ...normalizeMockProduct(supplierProduct),
          lastSyncedAt: new Date(),
        },
        create: {
          supplierId: supplier.id,
          rawProductId: rawProduct.id,
          ...normalizeMockProduct(supplierProduct),
          lastSyncedAt: new Date(),
        },
      });
      productsUpserted++;
    }
    return {
      supplier: { id: supplier.id, slug: supplier.slug, name: supplier.name },
      rawUpserted,
      productsUpserted,
    };
  }
}
