import { Injectable, NotFoundException } from '@nestjs/common';
import { GenerationJobStatus, OrderStatus, Prisma } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AdminGenerationsQueryDto } from './dto/admin-generations-query.dto.js';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto.js';
import { AdminProductsQueryDto } from './dto/admin-products-query.dto.js';
import { AdminPaginationQueryDto } from './dto/admin-pagination-query.dto.js';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import { UpdateProductAdminDto } from './dto/update-product-admin.dto.js';
import { UpdateSupplierOrderStatusDto } from './dto/update-supplier-order-status.dto.js';

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
          status: OrderStatus.CREATED,
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

    if (query.status) {
      where.status = query.status;
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
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
            },
          },
          items: {
            take: 5,
            orderBy: {
              createdAt: 'asc',
            },
          },
          supplierOrders: true,
          cart: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
        items: {
          include: {
            product: {
              include: {
                supplier: true,
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
        cart: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrderStatus(id: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: {
        id,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return this.prisma.order.update({
      where: {
        id,
      },
      data: {
        status: dto.status,
      },
      include: {
        items: true,
        supplierOrders: true,
      },
    });
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
