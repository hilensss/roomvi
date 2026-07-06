import type { Product } from '@/shared/api/types';
import type { CatalogFiltersState } from '../model/catalog.types';

export const CATALOG_PRICE_MIN = 0;
export const CATALOG_PRICE_MAX = 200_000;

export function formatMoney(value: number | null | undefined) {
  return `${new Intl.NumberFormat('ru-RU').format(value ?? 0)} ₽`;
}

export function getProductImage(product: Product) {
  return product.imageUrls?.[0] ?? null;
}

export function getProductOldPrice(product: Product) {
  return product.oldPrice && product.oldPrice > product.price
    ? product.oldPrice
    : null;
}

export function getProductDiscountPercent(product: Product) {
  const oldPrice = getProductOldPrice(product);

  if (!oldPrice) {
    return null;
  }

  return Math.round((1 - product.price / oldPrice) * 100);
}

export function getProductSubtitle(product: Product) {
  return [product.color, product.material].filter(Boolean).join(' · ');
}

export function isProductInStock(product: Product) {
  return product.stockStatus === 'IN_STOCK';
}

export function getPricePercent(value: number) {
  return (
    ((value - CATALOG_PRICE_MIN) / (CATALOG_PRICE_MAX - CATALOG_PRICE_MIN)) *
    100
  );
}

export function getProductPlural(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return 'товар';

  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'товара';
  }

  return 'товаров';
}

export function getActiveFiltersCount(filters: CatalogFiltersState) {
  return (
    Number(Boolean(filters.search.trim())) +
    filters.roomTypes.length +
    filters.categories.length +
    filters.styles.length +
    filters.stockStatuses.length +
    filters.brands.length +
    filters.colors.length +
    Number(filters.minPrice > CATALOG_PRICE_MIN) +
    Number(filters.maxPrice < CATALOG_PRICE_MAX)
  );
}

export function buildCatalogSearchParams(filters: CatalogFiltersState) {
  const params = new URLSearchParams();

  if (filters.search.trim()) {
    params.set('search', filters.search.trim());
  }

  if (filters.roomTypes.length > 0) {
    params.set('roomType', filters.roomTypes.join(','));
  }

  if (filters.categories.length > 0) {
    params.set('category', filters.categories.join(','));
  }

  if (filters.styles.length > 0) {
    params.set('style', filters.styles.join(','));
  }

  if (filters.stockStatuses.length > 0) {
    params.set('stockStatus', filters.stockStatuses.join(','));
  }

  if (filters.minPrice > CATALOG_PRICE_MIN) {
    params.set('minPrice', String(filters.minPrice));
  }

  if (filters.maxPrice < CATALOG_PRICE_MAX) {
    params.set('maxPrice', String(filters.maxPrice));
  }

  params.set('limit', String(filters.limit));
  params.set('offset', String(filters.offset));
  params.set('sort', filters.sort);

  return params.toString();
}
