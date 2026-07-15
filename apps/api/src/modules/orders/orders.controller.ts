import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { OrderQueryDto } from './dto/order-query.dto.js';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('orders')
  async createOrder(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.createOrder(dto, { user }, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard)
  @Post('cart/:cartId/checkout')
  async createOrderFromCart(
    @Param('cartId') cartId: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.createOrderFromCart(
      cartId,
      dto,
      { user },
      idempotencyKey,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders')
  async listMyOrders(
    @Query() query: OrderQueryDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.listMyOrders(query, { user });
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:id')
  async getOrderById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ordersService.getOrderById(id, {
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('orders/:id/cancel')
  async cancelOrder(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ordersService.cancelOrder(id, { user });
  }
}
