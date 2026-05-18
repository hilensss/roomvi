import { Product } from '@roomvi/database';
export function createProductSnapshot(product: Product) {
  return {
    id: product.id,
    supplierId: product.supplierId,
    externalId: product.externalId,
    title: product.title,
    description: product.description,
    category: product.category,
    price: product.price,
    oldPrice: product.oldPrice,
    currency: product.currency,
    stockStatus: product.stockStatus,
    imageUrls: product.imageUrls,
    productUrl: product.productUrl,
    widthCm: product.widthCm,
    heightCm: product.heightCm,
    depthCm: product.depthCm,
    material: product.material,
    color: product.color,
    capturedAt: new Date().toISOString(),
  };
}
