import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post('cart/:cartId/checkout')
  async createOrderFromCart(
    @Param('cartId') cartId: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.ordersService.createOrderFromCart(cartId, dto, {
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders')
  async listMyOrders(@CurrentUser() user: JwtUser) {
    return this.ordersService.listMyOrders({
      user,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('orders/:id')
  async getOrderById(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.ordersService.getOrderById(id, {
      user,
    });
  }
}
