import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { ProductCategory, StockStatus } from '@roomvi/database';
import { Type } from 'class-transformer';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto.js';

export class AdminProductsQueryDto extends AdminPaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProductCategory)
  category?: ProductCategory;

  @IsOptional()
  @IsEnum(StockStatus)
  stockStatus?: StockStatus;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAiEligible?: boolean;
}
