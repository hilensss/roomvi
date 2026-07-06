import { apiFetch } from '@/shared/api/api-client';
import type { Product, ProductsListResponse } from '@/shared/api/types';
import type { CatalogFiltersState } from '../model/catalog.types';
import { buildCatalogSearchParams } from '../lib/catalog.helpers';

export function getCatalogProducts(filters: CatalogFiltersState) {
  const query = buildCatalogSearchParams(filters);

  return apiFetch<ProductsListResponse | Product[]>(
    `/catalog/products${query ? `?${query}` : ''}`,
  );
}

export function addCatalogProductToCart(productId: string, quantity = 1) {
  return apiFetch('/cart/items', {
    method: 'POST',
    body: JSON.stringify({
      productId,
      quantity,
    }),
  });
}

export function getCatalogProduct(productId: string) {
  return apiFetch<Product>(`/catalog/products/${productId}`);
}
