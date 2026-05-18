import { Injectable } from '@nestjs/common';
import mockProducts from '../mock/mock-products.json' with { type: 'json' };
import {
  FetchProductsParams,
  SupplierAdapter,
  SupplierProductDto,
} from './supplier-adapter.interface.js';
@Injectable()
export class MockSupplierAdapter implements SupplierAdapter {
  supplierSlug = 'mock-supplier';
  supplierName = 'Mock Supplier';
  async fetchProducts(
    params?: FetchProductsParams,
  ): Promise<SupplierProductDto[]> {
    const offset = params?.offset ?? 0;
    const limit = params?.limit ?? mockProducts.length;
    return mockProducts
      .slice(offset, offset + limit)
      .map((product) => ({
        ...product,
        rawPayload: product,
      })) as SupplierProductDto[];
  }
  async fetchProductById(
    externalId: string,
  ): Promise<SupplierProductDto | null> {
    const product = mockProducts.find((item) => item.externalId === externalId);
    if (!product) return null;
    return { ...product, rawPayload: product } as SupplierProductDto;
  }
}
