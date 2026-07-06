import type {
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@/shared/api/types';

export type CatalogSort = 'popular' | 'price-asc' | 'price-desc' | 'new';

export type CatalogFiltersState = {
  search: string;
  roomTypes: RoomType[];
  categories: ProductCategory[];
  styles: InteriorStyle[];
  stockStatuses: StockStatus[];
  minPrice: number;
  maxPrice: number;

  // пока backend DTO не поддерживает brand/color, оставляем на фронте,
  // но НЕ отправляем в query
  brands: string[];
  colors: string[];

  sort: CatalogSort;
  limit: number;
  offset: number;
};

export type CatalogOption = {
  label: string;
  value: string;
};

export type CatalogProduct = Product;
