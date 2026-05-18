import { StockStatus } from '@roomvi/database';
import { SupplierProductDto } from '../suppliers/supplier-adapter.interface.js';
export function normalizeMockProduct(product: SupplierProductDto) {
  return {
    externalId: product.externalId,
    title: product.title,
    description: product.description,
    category: product.category,
    roomTypes: product.roomTypes,
    styleTags: product.styleTags,
    price: product.price,
    oldPrice: product.oldPrice,
    currency: product.currency ?? 'RUB',
    stockStatus: product.stockStatus,
    imageUrls: product.imageUrls,
    productUrl: product.productUrl,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    depthCm: product.depthCm,
    material: product.material,
    color: product.color,
    isActive: true,
    isAiEligible: product.stockStatus === StockStatus.IN_STOCK,
  };
}
