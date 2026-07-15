import { IsEnum } from 'class-validator';
import { OrderItemProcurementStatus } from '@roomvi/database';

export class UpdateOrderItemProcurementStatusDto {
  @IsEnum(OrderItemProcurementStatus)
  procurementStatus!: OrderItemProcurementStatus;
}
