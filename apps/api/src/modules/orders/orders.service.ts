import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CartItemSource,
  CartStatus,
  OrderStatus,
  PaymentStatus,
  RoomProjectStatus,
  SupplierOrderStatus,
} from '@roomvi/database';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CartService } from '../cart/cart.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';

type UserOrderContext = {
  user: JwtUser;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  async createOrderFromCart(
    cartId: string,
    dto: CreateOrderDto,
    context: UserOrderContext,
  ) {
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

    if (cart.status !== CartStatus.ACTIVE) {
      throw new BadRequestException('Cart is not active');
    }

    if (cart.userId !== context.user.userId) {
      throw new UnauthorizedException('No access to this cart');
    }

    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    await this.cartService.refreshCart(cart.id, {
      user: context.user,
    });

    const refreshedCart = await this.prisma.cart.findUnique({
      where: {
        id: cart.id,
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

    if (!refreshedCart) {
      throw new NotFoundException('Cart not found after refresh');
    }

    if (refreshedCart.userId !== context.user.userId) {
      throw new UnauthorizedException('No access to this cart');
    }

    if (refreshedCart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    const unavailableItems = refreshedCart.items.filter((item) => {
      return !item.product.isActive || item.product.stockStatus !== 'IN_STOCK';
    });

    if (unavailableItems.length > 0) {
      throw new BadRequestException({
        message: 'Cart contains unavailable products',
        unavailableItems: unavailableItems.map((item) => ({
          cartItemId: item.id,
          productId: item.productId,
          title: item.titleSnapshot,
          stockStatus: item.product.stockStatus,
          isActive: item.product.isActive,
        })),
      });
    }

    const supplierIds = [
      ...new Set(refreshedCart.items.map((item) => item.supplierId)),
    ];

    const projectIds = [
      ...new Set(
        refreshedCart.items
          .map((item) => item.roomProjectId)
          .filter(Boolean) as string[],
      ),
    ];

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          userId: context.user.userId,

          // Если корзина была собрана гостем и затем привязана к user,
          // guestSessionId сохраняем для аналитики.
          guestSessionId: refreshedCart.guestSessionId,

          cartId: refreshedCart.id,

          status: OrderStatus.CREATED,
          paymentStatus: PaymentStatus.NOT_REQUIRED,

          totalAmount: refreshedCart.totalAmount,
          currency: refreshedCart.currency,

          customerName: dto.customerName,
          customerPhone: dto.customerPhone,
          customerEmail: dto.customerEmail,

          deliveryAddress: dto.deliveryAddress,
          deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
          comment: dto.comment,

          items: {
            create: refreshedCart.items.map((item) => ({
              productId: item.productId,
              supplierId: item.supplierId,
              externalProductId: item.product.externalId,

              source: item.source,

              roomProjectId: item.roomProjectId,
              designVariantId: item.designVariantId,

              quantity: item.quantity,

              priceSnapshot: item.priceSnapshot,
              titleSnapshot: item.titleSnapshot,
              imageSnapshot: item.imageSnapshot,
              availabilitySnapshot: item.availabilitySnapshot,
            })),
          },

          supplierOrders: {
            create: supplierIds.map((supplierId) => ({
              supplierId,
              status: SupplierOrderStatus.MANUAL_PROCESSING,
              payload: this.buildSupplierOrderPayload(
                supplierId,
                refreshedCart.items,
                dto,
              ),
            })),
          },
        },
      });

      await tx.cart.update({
        where: {
          id: refreshedCart.id,
        },
        data: {
          status: CartStatus.ORDER_CREATED,
        },
      });

      if (projectIds.length > 0) {
        await tx.roomProject.updateMany({
          where: {
            id: {
              in: projectIds,
            },
          },
          data: {
            status: RoomProjectStatus.ORDER_CREATED,
          },
        });
      }

      return createdOrder;
    });

    return this.getOrderById(order.id, context);
  }

  async getOrderById(orderId: string, context: UserOrderContext) {
    const order = await this.prisma.order.findUnique({
      where: {
        id: orderId,
      },
      include: {
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
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
        supplierOrders: {
          include: {
            supplier: true,
          },
        },
        cart: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.userId !== context.user.userId) {
      throw new UnauthorizedException('No access to this order');
    }

    return order;
  }

  async listMyOrders(context: UserOrderContext) {
    return this.prisma.order.findMany({
      where: {
        userId: context.user.userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        items: {
          take: 3,
          orderBy: {
            createdAt: 'asc',
          },
        },
        cart: true,
      },
    });
  }

  private buildSupplierOrderPayload(
    supplierId: string,
    items: Array<{
      supplierId: string;
      productId: string;
      source: CartItemSource;
      roomProjectId: string | null;
      designVariantId: string | null;
      quantity: number;
      priceSnapshot: number;
      titleSnapshot: string;
      product: {
        externalId: string;
      };
    }>,
    dto: CreateOrderDto,
  ) {
    const supplierItems = items.filter(
      (item) => item.supplierId === supplierId,
    );

    return {
      customer: {
        name: dto.customerName,
        phone: dto.customerPhone,
        email: dto.customerEmail,
      },
      delivery: {
        address: dto.deliveryAddress,
        date: dto.deliveryDate,
        comment: dto.comment,
      },
      items: supplierItems.map((item) => ({
        productId: item.productId,
        externalProductId: item.product.externalId,
        source: item.source,
        roomProjectId: item.roomProjectId,
        designVariantId: item.designVariantId,
        title: item.titleSnapshot,
        quantity: item.quantity,
        price: item.priceSnapshot,
      })),
    };
  }
}
