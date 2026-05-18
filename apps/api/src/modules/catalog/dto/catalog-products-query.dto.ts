import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@roomvi/database';
import { Type } from 'class-transformer';
export class CatalogProductsQueryDto {
  @IsOptional() @IsEnum(RoomType) roomType?: RoomType;
  @IsOptional() @IsEnum(InteriorStyle) style?: InteriorStyle;
  @IsOptional() @IsEnum(ProductCategory) category?: ProductCategory;
  @IsOptional() @IsEnum(StockStatus) stockStatus?: StockStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxPrice?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
