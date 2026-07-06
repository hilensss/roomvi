import { IsEnum } from 'class-validator';
import { OrderStatus } from '@roomvi/database';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
