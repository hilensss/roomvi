import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  FulfillmentStatus,
  OrderItemProcurementStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RoomProjectStatus,
  StockStatus,
  SupplierOrderStatus,
} from '@roomvi/database';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderQueryDto } from './dto/order-query.dto.js';
import { assertOrderCanBeCancelled } from './order-state.js';

const POSTGRES_INT_MAX = 2_147_483_647;

const paymentSummarySelect = {
  id: true,
  provider: true,
  status: true,
  amount: true,
  currency: true,
  paymentUrl: true,
  paidAt: true,
} as const satisfies Prisma.PaymentSelect;

const publicOrderItemSelect = {
  id: true,
  productId: true,
  supplierId: true,
  source: true,
  roomProjectId: true,
  designVariantId: true,
  quantity: true,
  priceSnapshot: true,
  totalPrice: true,
  titleSnapshot: true,
  imageSnapshot: true,
  availabilitySnapshot: true,
  procurementStatus: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.OrderItemSelect;

const orderDetailSelect = {
  id: true,
  number: true,
  cartId: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  subtotalAmount: true,
  deliveryAmount: true,
  totalAmount: true,
  currency: true,
  customerName: true,
  customerEmail: true,
  customerPhone: true,
  deliveryCity: true,
  deliveryAddress: true,
  deliveryPostalCode: true,
  deliveryComment: true,
  customerComment: true,
  paidAt: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: publicOrderItemSelect,
    orderBy: { createdAt: 'asc' },
  },
  payments: {
    select: paymentSummarySelect,
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const satisfies Prisma.OrderSelect;

const orderSummarySelect = {
  id: true,
  number: true,
  status: true,
  paymentStatus: true,
  fulfillmentStatus: true,
  subtotalAmount: true,
  deliveryAmount: true,
  totalAmount: true,
  currency: true,
  paidAt: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: publicOrderItemSelect,
    orderBy: { createdAt: 'asc' },
    take: 3,
  },
  payments: {
    select: paymentSummarySelect,
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  _count: { select: { items: true } },
} as const satisfies Prisma.OrderSelect;

const checkoutCartSelect = {
  id: true,
  userId: true,
  guestSessionId: true,
  status: true,
  currency: true,
  items: {
    select: {
      productId: true,
      source: true,
      roomProjectId: true,
      designVariantId: true,
      quantity: true,
      product: {
        select: {
          id: true,
          supplierId: true,
          externalId: true,
          title: true,
          price: true,
          currency: true,
          stockStatus: true,
          isActive: true,
          imageUrls: true,
          productUrl: true,
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  },
} as const satisfies Prisma.CartSelect;

type UserOrderContext = {
  user: JwtUser;
};

type OrderDetailRecord = Prisma.OrderGetPayload<{
  select: typeof orderDetailSelect;
}>;

type OrderSummaryRecord = Prisma.OrderGetPayload<{
  select: typeof orderSummarySelect;
}>;

type PublicOrderItem = OrderDetailRecord['items'][number];
type CheckoutCart = Prisma.CartGetPayload<{
  select: typeof checkoutCartSelect;
}>;

function mapPayment(
  payment: OrderDetailRecord['payments'][number] | undefined,
) {
  if (!payment) {
    return null;
  }

  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    paymentUrl: payment.paymentUrl,
    paidAt: payment.paidAt,
  };
}

function mapPublicItem(item: PublicOrderItem) {
  return {
    id: item.id,
    productId: item.productId,
    supplierId: item.supplierId,
    source: item.source,
    roomProjectId: item.roomProjectId,
    designVariantId: item.designVariantId,
    quantity: item.quantity,
    priceSnapshot: item.priceSnapshot,
    totalPrice: item.totalPrice,
    titleSnapshot: item.titleSnapshot,
    imageSnapshot: item.imageSnapshot,
    availabilitySnapshot: item.availabilitySnapshot,
    procurementStatus: item.procurementStatus,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapOrderDetail(order: OrderDetailRecord) {
  return {
    id: order.id,
    number: order.number,
    cartId: order.cartId,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    subtotalAmount: order.subtotalAmount,
    deliveryAmount: order.deliveryAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    deliveryCity: order.deliveryCity,
    deliveryAddress: order.deliveryAddress,
    deliveryPostalCode: order.deliveryPostalCode,
    deliveryComment: order.deliveryComment,
    customerComment: order.customerComment,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    completedAt: order.completedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map(mapPublicItem),
    payment: mapPayment(order.payments[0]),
  };
}

function mapOrderSummary(order: OrderSummaryRecord) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    subtotalAmount: order.subtotalAmount,
    deliveryAmount: order.deliveryAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    paidAt: order.paidAt,
    cancelledAt: order.cancelledAt,
    completedAt: order.completedAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map(mapPublicItem),
    itemCount: order._count.items,
    payment: mapPayment(order.payments[0]),
  };
}

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(
    dto: CreateOrderDto,
    context: UserOrderContext,
    idempotencyKey?: string,
  ) {
    return this.checkout(undefined, dto, context, idempotencyKey);
  }

  async createOrderFromCart(
    cartId: string,
    dto: CreateOrderDto,
    context: UserOrderContext,
    idempotencyKey?: string,
  ) {
    return this.checkout(cartId, dto, context, idempotencyKey);
  }

  async getOrderById(orderId: string, context: UserOrderContext) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId: context.user.userId },
      select: orderDetailSelect,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return mapOrderDetail(order);
  }

  async listMyOrders(query: OrderQueryDto, context: UserOrderContext) {
    const where = { userId: context.user.userId };
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        select: orderSummarySelect,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: orders.map(mapOrderSummary),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async cancelOrder(orderId: string, context: UserOrderContext) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, userId: context.user.userId },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      if (
        order.status !== OrderStatus.PENDING_PAYMENT &&
        order.status !== OrderStatus.CONFIRMED
      ) {
        throw new ConflictException('Order can no longer be cancelled');
      }

      assertOrderCanBeCancelled(
        order.paymentStatus,
        order.fulfillmentStatus,
      );

      await tx.payment.updateMany({
        where: { orderId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.CANCELLED },
      });

      const cancelledAt = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CANCELLED,
          cancelledAt,
          ...(order.paymentStatus === PaymentStatus.PENDING
            ? { paymentStatus: PaymentStatus.CANCELLED }
            : {}),
        },
        select: orderDetailSelect,
      });

      return mapOrderDetail(updatedOrder);
    });
  }

  private async checkout(
    cartId: string | undefined,
    dto: CreateOrderDto,
    context: UserOrderContext,
    idempotencyKey: string | undefined,
  ) {
    const normalizedKey = this.normalizeIdempotencyKey(idempotencyKey);
    const userId = context.user.userId;

    if (normalizedKey) {
      const existingOrder = await this.prisma.order.findFirst({
        where: { userId, idempotencyKey: normalizedKey },
        select: orderDetailSelect,
      });

      if (existingOrder) {
        return mapOrderDetail(existingOrder);
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (normalizedKey) {
          const existingOrder = await tx.order.findFirst({
            where: { userId, idempotencyKey: normalizedKey },
            select: orderDetailSelect,
          });

          if (existingOrder) {
            return mapOrderDetail(existingOrder);
          }
        }

        const selectedCart = cartId
          ? await tx.cart.findUnique({
              where: { id: cartId },
              select: checkoutCartSelect,
            })
          : await tx.cart.findFirst({
              where: { userId, status: CartStatus.ACTIVE },
              orderBy: { updatedAt: 'desc' },
              select: checkoutCartSelect,
            });

        if (!selectedCart || selectedCart.userId !== userId) {
          throw new NotFoundException('Active cart not found');
        }

        if (selectedCart.status !== CartStatus.ACTIVE) {
          throw new BadRequestException('Cart is not active');
        }

        const { pricedItems, subtotalAmount, projectIds, supplierGroups } =
          this.priceCart(selectedCart);

        const createdOrder = await tx.order.create({
          data: {
            userId,
            guestSessionId: selectedCart.guestSessionId,
            cartId: selectedCart.id,
            idempotencyKey: normalizedKey,
            status: OrderStatus.PENDING_PAYMENT,
            paymentStatus: PaymentStatus.PENDING,
            fulfillmentStatus: FulfillmentStatus.NOT_STARTED,
            subtotalAmount,
            deliveryAmount: 0,
            totalAmount: subtotalAmount,
            currency: selectedCart.currency,
            customerName: dto.customerName,
            customerEmail: dto.customerEmail,
            customerPhone: dto.customerPhone,
            deliveryCity: dto.deliveryCity,
            deliveryAddress: dto.deliveryAddress,
            deliveryPostalCode: dto.deliveryPostalCode,
            deliveryComment: dto.deliveryComment,
            customerComment: dto.customerComment,
            deliveryDate: null,
            paidAt: null,
            cancelledAt: null,
            completedAt: null,
            items: {
              create: pricedItems.map((item) => ({
                productId: item.product.id,
                supplierId: item.product.supplierId,
                externalProductId: item.product.externalId,
                source: item.source,
                roomProjectId: item.roomProjectId,
                designVariantId: item.designVariantId,
                quantity: item.quantity,
                priceSnapshot: item.product.price,
                totalPrice: item.totalPrice,
                titleSnapshot: item.product.title,
                imageSnapshot: item.product.imageUrls[0] ?? null,
                availabilitySnapshot: item.product.stockStatus,
                supplierNameSnapshot: item.product.supplier.name,
                productUrlSnapshot: item.product.productUrl,
                procurementStatus: OrderItemProcurementStatus.NOT_STARTED,
              })),
            },
            payments: {
              create: {
                provider: PaymentProvider.MANUAL,
                status: PaymentStatus.PENDING,
                amount: subtotalAmount,
                currency: 'RUB',
              },
            },
            supplierOrders: {
              create: supplierGroups.map((group) => ({
                supplierId: group.supplierId,
                status: SupplierOrderStatus.MANUAL_PROCESSING,
                payload: {
                  supplierId: group.supplierId,
                  supplierName: group.supplierName,
                  currency: selectedCart.currency,
                  items: group.items.map((item) => ({
                    productId: item.product.id,
                    externalProductId: item.product.externalId,
                    title: item.product.title,
                    imageUrl: item.product.imageUrls[0] ?? null,
                    productUrl: item.product.productUrl,
                    availability: item.product.stockStatus,
                    quantity: item.quantity,
                    price: item.product.price,
                    totalPrice: item.totalPrice,
                    source: item.source,
                    roomProjectId: item.roomProjectId,
                    designVariantId: item.designVariantId,
                  })),
                },
              })),
            },
          },
          select: orderDetailSelect,
        });

        await tx.cartItem.deleteMany({
          where: { cartId: selectedCart.id },
        });

        await tx.cart.update({
          where: { id: selectedCart.id },
          data: {
            status: CartStatus.ORDER_CREATED,
            totalAmount: subtotalAmount,
            currency: selectedCart.currency,
          },
        });

        if (projectIds.length > 0) {
          await tx.roomProject.updateMany({
            where: { id: { in: projectIds } },
            data: { status: RoomProjectStatus.ORDER_CREATED },
          });
        }

        return mapOrderDetail(createdOrder);
      });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      if (normalizedKey) {
        const existingOrder = await this.prisma.order.findFirst({
          where: { userId, idempotencyKey: normalizedKey },
          select: orderDetailSelect,
        });

        if (existingOrder) {
          return mapOrderDetail(existingOrder);
        }
      }

      throw new ConflictException('An order already exists for this cart');
    }
  }

  private priceCart(cart: CheckoutCart) {
    if (cart.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    let subtotalAmount = 0;
    const pricedItems = cart.items.map((item) => {
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new BadRequestException(
          'Cart item quantity must be a positive integer',
        );
      }

      if (
        !item.product.isActive ||
        item.product.stockStatus !== StockStatus.IN_STOCK
      ) {
        throw new BadRequestException('Cart contains unavailable products');
      }

      if (!Number.isInteger(item.product.price) || item.product.price <= 0) {
        throw new BadRequestException(
          'Product price must be a positive integer',
        );
      }

      if (item.product.currency !== cart.currency) {
        throw new BadRequestException('Cart contains mixed currencies');
      }

      const totalPrice = item.product.price * item.quantity;
      if (!Number.isInteger(totalPrice) || totalPrice > POSTGRES_INT_MAX) {
        throw new BadRequestException(
          'Cart item total exceeds the supported amount',
        );
      }

      subtotalAmount += totalPrice;
      if (subtotalAmount > POSTGRES_INT_MAX) {
        throw new BadRequestException('Cart total exceeds the supported amount');
      }

      return { ...item, totalPrice };
    });

    const projectIds = [
      ...new Set(
        pricedItems
          .map((item) => item.roomProjectId)
          .filter((id): id is string => id !== null),
      ),
    ];

    const groups = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        items: typeof pricedItems;
      }
    >();

    for (const item of pricedItems) {
      const supplierId = item.product.supplierId;
      const group = groups.get(supplierId);
      if (group) {
        group.items.push(item);
      } else {
        groups.set(supplierId, {
          supplierId,
          supplierName: item.product.supplier.name,
          items: [item],
        });
      }
    }

    return {
      pricedItems,
      subtotalAmount,
      projectIds,
      supplierGroups: [...groups.values()],
    };
  }

  private normalizeIdempotencyKey(key: string | undefined) {
    if (key === undefined) {
      return null;
    }

    const normalized = key.trim();
    if (normalized.length < 1 || normalized.length > 128) {
      throw new BadRequestException(
        'Idempotency-Key must contain between 1 and 128 characters',
      );
    }

    return normalized;
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }
}
