import {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';
export type SupplierProductDto = {
  externalId: string;
  title: string;
  description?: string;
  category: ProductCategory;
  roomTypes: RoomType[];
  styleTags: InteriorStyle[];
  price: number;
  oldPrice?: number;
  currency?: string;
  stockStatus: StockStatus;
  imageUrls: string[];
  productUrl?: string;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  material?: string;
  color?: string;
  rawPayload: unknown;
};
export type FetchProductsParams = { limit?: number; offset?: number };
export interface SupplierAdapter {
  supplierSlug: string;
  supplierName: string;
  fetchProducts(params?: FetchProductsParams): Promise<SupplierProductDto[]>;
  fetchProductById(externalId: string): Promise<SupplierProductDto | null>;
}
