import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto } from './dto/add-cart-item.dto.js';
import { UpdateCartItemDto } from './dto/update-cart-item.dto.js';
import { GUEST_COOKIE_NAMES } from '../guest/constants/guest-cookies.constants.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';

@Controller()
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get('cart/current')
  async getCurrentCart(@Req() req: Request) {
    return this.cartService.getCurrentCart(this.getAccessContext(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('cart/:id')
  async getCartById(@Param('id') id: string, @Req() req: Request) {
    return this.cartService.getCartById(id, this.getAccessContext(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('cart/items')
  async addCatalogProductToCart(
    @Body() dto: AddCartItemDto,
    @Req() req: Request,
  ) {
    return this.cartService.addCatalogProductToCart(
      dto.productId,
      dto.quantity ?? 1,
      this.getAccessContext(req),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('design-variants/:id/add-to-cart')
  async addDesignVariantToCart(@Param('id') id: string, @Req() req: Request) {
    return this.cartService.addDesignVariantToCart(
      id,
      this.getAccessContext(req),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Patch('cart/items/:id')
  async updateCartItemQuantity(
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
    @Req() req: Request,
  ) {
    return this.cartService.updateCartItemQuantity(
      id,
      dto.quantity,
      this.getAccessContext(req),
    );
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Delete('cart/items/:id')
  async removeCartItem(@Param('id') id: string, @Req() req: Request) {
    return this.cartService.removeCartItem(id, this.getAccessContext(req));
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('cart/:id/refresh')
  async refreshCart(@Param('id') id: string, @Req() req: Request) {
    return this.cartService.refreshCart(id, this.getAccessContext(req));
  }

  private getAccessContext(req: Request) {
    return {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    };
  }
}
