import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationJobStatus,
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertOrderCanBeCancelled,
  assertOrderItemProcurementTransition,
  assertOrderStatusTransition,
  deriveFulfillmentStatus,
} from '../orders/order-state.js';
import { runSerializableTransaction } from '../orders/serializable-transaction.js';
import { AdminGenerationsQueryDto } from './dto/admin-generations-query.dto.js';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto.js';
import { AdminProductsQueryDto } from './dto/admin-products-query.dto.js';
import { AdminPaginationQueryDto } from './dto/admin-pagination-query.dto.js';
import { UpdateManagerCommentDto } from './dto/update-manager-comment.dto.js';
import { UpdateOrderItemProcurementStatusDto } from './dto/update-order-item-procurement-status.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { UpdateProductAdminDto } from './dto/update-product-admin.dto.js';
import { UpdateSupplierOrderStatusDto } from './dto/update-supplier-order-status.dto.js';

const adminPaymentSelect = {
  id: true,
  provider: true,
  status: true,
  externalPaymentId: true,
  paymentUrl: true,
  amount: true,
  currency: true,
  failureCode: true,
  failureMessage: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.PaymentSelect;

const adminOrderItemSelect = {
  id: true,
  orderId: true,
  productId: true,
  supplierId: true,
  externalProductId: true,
  source: true,
  roomProjectId: true,
  designVariantId: true,
  quantity: true,
  priceSnapshot: true,
  totalPrice: true,
  titleSnapshot: true,
  imageSnapshot: true,
  availabilitySnapshot: true,
  supplierNameSnapshot: true,
  productUrlSnapshot: true,
  procurementStatus: true,
  managerComment: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.OrderItemSelect;

const adminUserSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
} as const satisfies Prisma.UserSelect;

const adminOrderScalarSelect = {
  id: true,
  number: true,
  userId: true,
  guestSessionId: true,
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
  deliveryDate: true,
  customerComment: true,
  managerComment: true,
  paidAt: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.OrderSelect;

const adminOrderListSelect = {
  ...adminOrderScalarSelect,
  user: { select: adminUserSelect },
  items: {
    select: adminOrderItemSelect,
    orderBy: { createdAt: 'asc' },
    take: 5,
  },
  supplierOrders: true,
  payments: {
    select: adminPaymentSelect,
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const satisfies Prisma.OrderSelect;

const adminOrderDetailSelect = {
  ...adminOrderScalarSelect,
  user: { select: adminUserSelect },
  items: {
    select: adminOrderItemSelect,
    orderBy: { createdAt: 'asc' },
  },
  supplierOrders: {
    include: { supplier: true },
  },
  cart: {
    include: { items: true },
  },
  payments: {
    select: adminPaymentSelect,
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
} as const satisfies Prisma.OrderSelect;

function mapAdminOrder<T extends { payments: unknown[] }>(order: T) {
  const { payments, ...result } = order;
  return {
    ...result,
    payment: payments[0] ?? null,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [
      usersCount,
      guestSessionsCount,
      productsCount,
      activeProductsCount,
      ordersCount,
      createdOrdersCount,
      generationJobsCount,
      failedGenerationJobsCount,
      cartsCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.guestSession.count(),
      this.prisma.product.count(),
      this.prisma.product.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.order.count(),
      this.prisma.order.count({
        where: {
          status: OrderStatus.PENDING_PAYMENT,
        },
      }),
      this.prisma.generationJob.count(),
      this.prisma.generationJob.count({
        where: {
          status: GenerationJobStatus.FAILED,
        },
      }),
      this.prisma.cart.count(),
    ]);

    const latestOrders = await this.prisma.order.findMany({
      take: 5,
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
      },
    });

    const latestGenerationJobs = await this.prisma.generationJob.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        roomProject: true,
      },
    });

    return {
      counters: {
        usersCount,
        guestSessionsCount,
        productsCount,
        activeProductsCount,
        ordersCount,
        createdOrdersCount,
        generationJobsCount,
        failedGenerationJobsCount,
        cartsCount,
      },
      latestOrders,
      latestGenerationJobs,
    };
  }

  async findOrders(query: AdminOrdersQueryDto) {
    const where: Prisma.OrderWhereInput = {};

    const createdFrom = query.createdFrom
      ? new Date(query.createdFrom)
      : undefined;
    const createdTo = query.createdTo ? new Date(query.createdTo) : undefined;

    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new BadRequestException('createdFrom must not be after createdTo');
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.paymentStatus) {
      where.paymentStatus = query.paymentStatus;
    }

    if (query.fulfillmentStatus) {
      where.fulfillmentStatus = query.fulfillmentStatus;
    }

    if (query.number !== undefined) {
      where.number = query.number;
    }

    if (query.customerEmail) {
      where.customerEmail = {
        contains: query.customerEmail,
        mode: 'insensitive',
      };
    }

    if (query.customerPhone) {
      where.customerPhone = {
        contains: query.customerPhone,
        mode: 'insensitive',
      };
    }

    if (createdFrom || createdTo) {
      where.createdAt = {
        ...(createdFrom ? { gte: createdFrom } : {}),
        ...(createdTo ? { lte: createdTo } : {}),
      };
    }

    if (query.search) {
      where.OR = [
        {
          customerName: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          customerPhone: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          customerEmail: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: {
          createdAt: 'desc',
        },
        select: adminOrderListSelect,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map(mapAdminOrder),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: adminOrderDetailSelect,
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return mapAdminOrder(order);
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          fulfillmentStatus: true,
          completedAt: true,
          cancelledAt: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Order not found');
      }

      assertOrderStatusTransition(order.status, dto.status);

      if (order.status !== dto.status) {
        const data: Prisma.OrderUpdateManyMutationInput = {
          status: dto.status,
        };

        if (dto.status === OrderStatus.COMPLETED && !order.completedAt) {
          data.completedAt = new Date();
        }

        if (dto.status === OrderStatus.CANCELLED) {
          assertOrderCanBeCancelled(
            order.paymentStatus,
            order.fulfillmentStatus,
          );
          data.cancelledAt = new Date();
          if (order.paymentStatus === PaymentStatus.PENDING) {
            data.paymentStatus = PaymentStatus.CANCELLED;
          }
        }

        const updated = await tx.order.updateMany({
          where: {
            id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            fulfillmentStatus: order.fulfillmentStatus,
          },
          data,
        });

        if (updated.count !== 1) {
          throw new ConflictException('Order changed during status update');
        }

        if (dto.status === OrderStatus.CANCELLED) {
          await tx.payment.updateMany({
            where: { orderId: id, status: PaymentStatus.PENDING },
            data: { status: PaymentStatus.CANCELLED },
          });
        }
      }

      const updatedOrder = await tx.order.findUnique({
        where: { id },
        select: adminOrderDetailSelect,
      });

      if (!updatedOrder) {
        throw new ConflictException('Updated order could not be reloaded');
      }

      return mapAdminOrder(updatedOrder);
    });
  }

  async updateOrderItemProcurementStatus(
    orderId: string,
    itemId: string,
    dto: UpdateOrderItemProcurementStatusDto,
  ) {
    return runSerializableTransaction(this.prisma, async (tx) => {
      const item = await tx.orderItem.findFirst({
        where: { id: itemId, orderId },
        select: { id: true, procurementStatus: true },
      });

      if (!item) {
        throw new NotFoundException('Order item not found');
      }

      assertOrderItemProcurementTransition(
        item.procurementStatus,
        dto.procurementStatus,
      );

      if (item.procurementStatus !== dto.procurementStatus) {
        const updated = await tx.orderItem.updateMany({
          where: {
            id: itemId,
            orderId,
            procurementStatus: item.procurementStatus,
          },
          data: { procurementStatus: dto.procurementStatus },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Order item changed during procurement update',
          );
        }
      }

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { procurementStatus: true },
      });
      const fulfillmentStatus = deriveFulfillmentStatus(
        items.map((orderItem) => orderItem.procurementStatus),
      );

      await tx.order.update({
        where: { id: orderId },
        data: { fulfillmentStatus },
      });

      const updatedOrder = await tx.order.findUnique({
        where: { id: orderId },
        select: adminOrderDetailSelect,
      });

      if (!updatedOrder) {
        throw new ConflictException('Updated order could not be reloaded');
      }

      return mapAdminOrder(updatedOrder);
    });
  }

  async updateOrderManagerComment(
    orderId: string,
    dto: UpdateManagerCommentDto,
  ) {
    const updated = await this.prisma.order.updateMany({
      where: { id: orderId },
      data: { managerComment: dto.managerComment },
    });

    if (updated.count !== 1) {
      throw new NotFoundException('Order not found');
    }

    return this.getOrderById(orderId);
  }

  async updateOrderItemManagerComment(
    orderId: string,
    itemId: string,
    dto: UpdateManagerCommentDto,
  ) {
    const updated = await this.prisma.orderItem.updateMany({
      where: { id: itemId, orderId },
      data: { managerComment: dto.managerComment },
    });

    if (updated.count !== 1) {
      throw new NotFoundException('Order item not found');
    }

    return this.getOrderById(orderId);
  }

  async findSupplierOrders(query: AdminPaginationQueryDto) {
    const [items, total] = await Promise.all([
      this.prisma.supplierOrder.findMany({
        take: query.limit,
        skip: query.offset,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          supplier: true,
          order: {
            select: {
              id: true,
              status: true,
              totalAmount: true,
              customerName: true,
              customerPhone: true,
              deliveryAddress: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.supplierOrder.count(),
    ]);

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async updateSupplierOrderStatus(
    id: string,
    dto: UpdateSupplierOrderStatusDto,
  ) {
    const supplierOrder = await this.prisma.supplierOrder.findUnique({
      where: {
        id,
      },
    });

    if (!supplierOrder) {
      throw new NotFoundException('Supplier order not found');
    }

    return this.prisma.supplierOrder.update({
      where: {
        id,
      },
      data: {
        status: dto.status,
        externalOrderId: dto.externalOrderId,
      },
      include: {
        supplier: true,
        order: true,
      },
    });
  }

  async findGenerationJobs(query: AdminGenerationsQueryDto) {
    const where: Prisma.GenerationJobWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.generationJob.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          roomProject: true,
          designVariants: {
            take: 3,
            orderBy: {
              createdAt: 'asc',
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          guestSession: {
            select: {
              id: true,
              anonymousId: true,
              convertedUserId: true,
              createdAt: true,
            },
          },
        },
      }),
      this.prisma.generationJob.count({ where }),
    ]);

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getGenerationJobById(id: string) {
    const generationJob = await this.prisma.generationJob.findUnique({
      where: {
        id,
      },
      include: {
        roomProject: true,
        designVariants: {
          include: {
            products: {
              include: {
                product: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        guestSession: true,
      },
    });

    if (!generationJob) {
      throw new NotFoundException('Generation job not found');
    }

    return generationJob;
  }

  async findProducts(query: AdminProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {};

    if (query.category) {
      where.category = query.category;
    }

    if (query.stockStatus) {
      where.stockStatus = query.stockStatus;
    }

    if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    if (typeof query.isAiEligible === 'boolean') {
      where.isAiEligible = query.isAiEligible;
    }

    if (query.search) {
      where.OR = [
        {
          title: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
        {
          externalId: {
            contains: query.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        take: query.limit,
        skip: query.offset,
        orderBy: {
          updatedAt: 'desc',
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async updateProduct(id: string, dto: UpdateProductAdminDto) {
    const product = await this.prisma.product.findUnique({
      where: {
        id,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.prisma.product.update({
      where: {
        id,
      },
      data: {
        title: dto.title,
        price: dto.price,
        stockStatus: dto.stockStatus,
        isActive: dto.isActive,
        isAiEligible: dto.isAiEligible,
      },
      include: {
        supplier: true,
      },
    });
  }
}
