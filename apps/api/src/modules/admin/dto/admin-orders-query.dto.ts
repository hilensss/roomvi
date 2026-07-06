import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@roomvi/database';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto.js';

export class AdminOrdersQueryDto extends AdminPaginationQueryDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
