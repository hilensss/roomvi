import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartItemSource,
  CartStatus,
  Product,
  RoomProjectStatus,
  StockStatus,
} from '@roomvi/database';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GuestService } from '../guest/guest.service.js';

type AccessContext = {
  user?: JwtUser;
  guestAnonymousId?: string;
};

type CartOwner = {
  userId?: string;
  guestSessionId?: string;
};

type CartRefreshChangeType =
  | 'PRICE_CHANGED'
  | 'OUT_OF_STOCK'
  | 'PRODUCT_INACTIVE'
  | 'PRODUCT_RESTORED';

type CartRefreshChange = {
  cartItemId: string;
  productId: string;
  type: CartRefreshChangeType;
  title: string;
  oldPrice?: number;
  newPrice?: number;
  oldAvailability?: string;
  newAvailability?: string;
};

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestService: GuestService,
  ) {}

  async getCurrentCart(context: AccessContext) {
    const owner = await this.resolveOwner(context);

    const cart = await this.findActiveCart(owner);

    if (!cart) {
      return {
        cart: null,
        items: [],
        totalAmount: 0,
        currency: 'RUB',
      };
    }

    return cart;
  }

  async addCatalogProductToCart(
    productId: string,
    quantity: number,
    context: AccessContext,
  ) {
    const owner = await this.resolveOwner(context);

    const product = await this.getActiveProduct(productId);
    const cart = await this.getOrCreateActiveCart(owner);

    const existingItem = await this.prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId: product.id,
        source: CartItemSource.CATALOG,
        roomProjectId: null,
        designVariantId: null,
      },
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          quantity: {
            increment: quantity,
          },
          priceSnapshot: product.price,
          titleSnapshot: product.title,
          imageSnapshot: product.imageUrls[0] ?? null,
          availabilitySnapshot: product.stockStatus,
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          supplierId: product.supplierId,
          source: CartItemSource.CATALOG,
          quantity,
          priceSnapshot: product.price,
          titleSnapshot: product.title,
          imageSnapshot: product.imageUrls[0] ?? null,
          availabilitySnapshot: product.stockStatus,
        },
      });
    }

    return this.recalculateAndReturnCart(cart.id);
  }

  async addDesignVariantToCart(
    designVariantId: string,
    context: AccessContext,
  ) {
    const owner = await this.resolveOwner(context);

    const designVariant = await this.prisma.designVariant.findUnique({
      where: {
        id: designVariantId,
      },
      include: {
        roomProject: true,
        products: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!designVariant) {
      throw new NotFoundException('Design variant not found');
    }

    await this.assertProjectAccess(
      {
        userId: designVariant.roomProject.userId,
        guestSessionId: designVariant.roomProject.guestSessionId,
      },
      context,
    );

    if (designVariant.products.length === 0) {
      throw new BadRequestException('Design variant has no products');
    }

    const cart = await this.getOrCreateActiveCart(owner);

    for (const variantProduct of designVariant.products) {
      const product = variantProduct.product;

      if (!product.isActive) {
        continue;
      }

      const existingItem = await this.prisma.cartItem.findFirst({
        where: {
          cartId: cart.id,
          productId: product.id,
          source: CartItemSource.DESIGN_PROJECT,
          roomProjectId: designVariant.roomProjectId,
          designVariantId: designVariant.id,
        },
      });

      if (existingItem) {
        await this.prisma.cartItem.update({
          where: {
            id: existingItem.id,
          },
          data: {
            quantity: {
              increment: 1,
            },
            priceSnapshot: product.price,
            titleSnapshot: product.title,
            imageSnapshot: product.imageUrls[0] ?? null,
            availabilitySnapshot: product.stockStatus,
          },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            productId: product.id,
            supplierId: product.supplierId,
            source: CartItemSource.DESIGN_PROJECT,
            roomProjectId: designVariant.roomProjectId,
            designVariantId: designVariant.id,
            quantity: 1,
            priceSnapshot: product.price,
            titleSnapshot: product.title,
            imageSnapshot: product.imageUrls[0] ?? null,
            availabilitySnapshot: product.stockStatus,
          },
        });
      }
    }

    await this.prisma.$transaction([
      this.prisma.designVariant.updateMany({
        where: {
          roomProjectId: designVariant.roomProjectId,
        },
        data: {
          isSelected: false,
        },
      }),
      this.prisma.designVariant.update({
        where: {
          id: designVariant.id,
        },
        data: {
          isSelected: true,
        },
      }),
      this.prisma.roomProject.update({
        where: {
          id: designVariant.roomProjectId,
        },
        data: {
          selectedDesignVariantId: designVariant.id,
          status: RoomProjectStatus.SELECTED,
        },
      }),
    ]);

    return this.recalculateAndReturnCart(cart.id);
  }

  async updateCartItemQuantity(
    cartItemId: string,
    quantity: number,
    context: AccessContext,
  ) {
    const item = await this.prisma.cartItem.findUnique({
      where: {
        id: cartItemId,
      },
      include: {
        cart: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.assertCartAccess(item.cart, context);

    await this.prisma.cartItem.update({
      where: {
        id: item.id,
      },
      data: {
        quantity,
      },
    });

    return this.recalculateAndReturnCart(item.cartId);
  }

  async removeCartItem(cartItemId: string, context: AccessContext) {
    const item = await this.prisma.cartItem.findUnique({
      where: {
        id: cartItemId,
      },
      include: {
        cart: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found');
    }

    await this.assertCartAccess(item.cart, context);

    await this.prisma.cartItem.delete({
      where: {
        id: item.id,
      },
    });

    return this.recalculateAndReturnCart(item.cartId);
  }

  async refreshCart(cartId: string, context: AccessContext) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        id: cartId,
      },
      include: {
        items: {
          include: {
            product: true,
            roomProject: true,
            designVariant: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.assertCartAccess(cart, context);

    const changes: CartRefreshChange[] = [];

    for (const item of cart.items) {
      const product = item.product;

      if (!product.isActive) {
        changes.push({
          cartItemId: item.id,
          productId: product.id,
          type: 'PRODUCT_INACTIVE',
          title: item.titleSnapshot,
        });
      }

      if (product.stockStatus !== item.availabilitySnapshot) {
        changes.push({
          cartItemId: item.id,
          productId: product.id,
          type:
            product.stockStatus === StockStatus.IN_STOCK
              ? 'PRODUCT_RESTORED'
              : 'OUT_OF_STOCK',
          title: product.title,
          oldAvailability: item.availabilitySnapshot,
          newAvailability: product.stockStatus,
        });
      }

      if (product.price !== item.priceSnapshot) {
        changes.push({
          cartItemId: item.id,
          productId: product.id,
          type: 'PRICE_CHANGED',
          title: product.title,
          oldPrice: item.priceSnapshot,
          newPrice: product.price,
        });
      }

      await this.prisma.cartItem.update({
        where: {
          id: item.id,
        },
        data: {
          priceSnapshot: product.price,
          titleSnapshot: product.title,
          imageSnapshot: product.imageUrls[0] ?? null,
          availabilitySnapshot: product.stockStatus,
        },
      });
    }

    const updatedCart = await this.recalculateAndReturnCart(cart.id);

    return {
      cart: updatedCart,
      summary: {
        hasChanges: changes.length > 0,
        priceChangedCount: changes.filter(
          (change) => change.type === 'PRICE_CHANGED',
        ).length,
        unavailableCount: changes.filter(
          (change) => change.type === 'OUT_OF_STOCK',
        ).length,
        inactiveCount: changes.filter(
          (change) => change.type === 'PRODUCT_INACTIVE',
        ).length,
      },
      changes,
    };
  }

  async getCartById(cartId: string, context: AccessContext) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        id: cartId,
      },
      include: this.getCartInclude(),
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    await this.assertCartAccess(cart, context);

    return cart;
  }

  private async resolveOwner(context: AccessContext): Promise<CartOwner> {
    if (context.user) {
      return {
        userId: context.user.userId,
        guestSessionId: undefined,
      };
    }

    if (!context.guestAnonymousId) {
      throw new UnauthorizedException('Auth or guest session required');
    }

    const guestSession = await this.guestService.findValidSessionByAnonymousId(
      context.guestAnonymousId,
    );

    if (!guestSession) {
      throw new UnauthorizedException('Invalid guest session');
    }

    return {
      userId: undefined,
      guestSessionId: guestSession.id,
    };
  }

  private async findActiveCart(owner: CartOwner) {
    return this.prisma.cart.findFirst({
      where: {
        userId: owner.userId,
        guestSessionId: owner.guestSessionId,
        status: CartStatus.ACTIVE,
      },
      include: this.getCartInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async getOrCreateActiveCart(owner: CartOwner) {
    const existingCart = await this.findActiveCart(owner);

    if (existingCart) {
      return existingCart;
    }

    return this.prisma.cart.create({
      data: {
        userId: owner.userId,
        guestSessionId: owner.guestSessionId,
        status: CartStatus.ACTIVE,
        totalAmount: 0,
        currency: 'RUB',
      },
      include: this.getCartInclude(),
    });
  }

  private async getActiveProduct(productId: string): Promise<Product> {
    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found');
    }

    if (product.stockStatus !== StockStatus.IN_STOCK) {
      throw new BadRequestException('Product is not in stock');
    }

    return product;
  }

  private async recalculateAndReturnCart(cartId: string) {
    const cart = await this.prisma.cart.findUnique({
      where: {
        id: cartId,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const totalAmount = cart.items.reduce((sum: number, item: any) => {
      if (
        !item.product.isActive ||
        item.product.stockStatus !== StockStatus.IN_STOCK
      ) {
        return sum;
      }

      return sum + item.priceSnapshot * item.quantity;
    }, 0);

    await this.prisma.cart.update({
      where: {
        id: cart.id,
      },
      data: {
        totalAmount,
      },
    });

    return this.prisma.cart.findUnique({
      where: {
        id: cart.id,
      },
      include: this.getCartInclude(),
    });
  }

  private async assertCartAccess(
    cart: {
      userId: string | null;
      guestSessionId: string | null;
    },
    context: AccessContext,
  ) {
    if (context.user && cart.userId === context.user.userId) {
      return;
    }

    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );

      if (guestSession && cart.guestSessionId === guestSession.id) {
        return;
      }
    }

    throw new UnauthorizedException('No access to this cart');
  }

  private async assertProjectAccess(
    project: {
      userId: string | null;
      guestSessionId: string | null;
    },
    context: AccessContext,
  ) {
    if (context.user && project.userId === context.user.userId) {
      return;
    }

    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );

      if (guestSession && project.guestSessionId === guestSession.id) {
        return;
      }
    }

    throw new UnauthorizedException('No access to this design project');
  }

  private getCartInclude() {
    return {
      items: {
        include: {
          product: {
            include: {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  websiteUrl: true,
                },
              },
            },
          },
          roomProject: {
            select: {
              id: true,
              title: true,
              roomType: true,
              style: true,
              status: true,
            },
          },
          designVariant: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              totalPrice: true,
            },
          },
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
    };
  }
}
