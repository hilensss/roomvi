import { IsEnum, IsOptional, IsString } from 'class-validator';
import { SupplierOrderStatus } from '@roomvi/database';

export class UpdateSupplierOrderStatusDto {
  @IsEnum(SupplierOrderStatus)
  status!: SupplierOrderStatus;

  @IsOptional()
  @IsString()
  externalOrderId?: string;
}
