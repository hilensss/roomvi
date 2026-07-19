import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  B2BProjectStatus,
  B2BProjectType,
  GenerationJobStatus,
  GenerationOwnerType,
  GenerationProvider,
  GenerationScenario,
  Prisma,
  RoomProjectStatus,
  StockStatus,
  SupplierStatus,
} from '@roomvi/database';
import { GenerationQueueService } from '../generation-queue/generation-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { B2BProjectCatalogQueryDto } from './dto/b2b-project-catalog-query.dto.js';
import { CreateB2BProjectDto } from './dto/create-b2b-project.dto.js';
import { ListB2BProjectsQueryDto } from './dto/list-b2b-projects-query.dto.js';
import { UpdateB2BProjectDto } from './dto/update-b2b-project.dto.js';

const projectDetailInclude = {
  supplier: true,
  products: {
    orderBy: { sortOrder: 'asc' as const },
    include: { product: true },
  },
  roomProject: {
    include: {
      generationJobs: {
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        include: {
          designVariants: {
            orderBy: { createdAt: 'asc' as const },
            include: { products: { include: { product: true } } },
          },
        },
      },
    },
  },
} satisfies Prisma.B2BProjectInclude;

@Injectable()
export class B2BProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generationQueueService: GenerationQueueService,
  ) {}

  async list(query: ListB2BProjectsQueryDto) {
    const where: Prisma.B2BProjectWhereInput = {
      status: query.status,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { partnerName: { contains: query.search, mode: 'insensitive' } },
              {
                supplier: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.b2BProject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: {
          supplier: true,
          _count: { select: { products: true } },
          roomProject: {
            select: {
              generationJobs: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, status: true, progress: true },
              },
            },
          },
        },
      }),
      this.prisma.b2BProject.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async listSuppliers() {
    return this.prisma.supplier.findMany({
      where: { status: SupplierStatus.ACTIVE },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, logoUrl: true },
    });
  }

  async create(dto: CreateB2BProjectDto, createdById: string) {
    await this.requireActiveSupplier(dto.supplierId);

    return this.prisma.b2BProject.create({
      data: {
        type: B2BProjectType.FURNITURE_LINE,
        name: dto.name.trim(),
        partnerName: dto.partnerName.trim(),
        supplierId: dto.supplierId,
        roomType: dto.roomType,
        style: dto.style,
        managerComment: dto.managerComment?.trim() || null,
        createdById,
      },
      include: projectDetailInclude,
    });
  }

  async getById(id: string) {
    const project = await this.prisma.b2BProject.findUnique({
      where: { id },
      include: projectDetailInclude,
    });
    if (!project) throw new NotFoundException('B2B project not found');
    return project;
  }

  async update(id: string, dto: UpdateB2BProjectDto) {
    const project = await this.requireProject(id);
    this.requireMutable(project.status);

    if (dto.supplierId) await this.requireActiveSupplier(dto.supplierId);
    const supplierChanged =
      dto.supplierId !== undefined && dto.supplierId !== project.supplierId;

    return this.prisma.$transaction(async (tx) => {
      if (supplierChanged) {
        await tx.b2BProjectProduct.deleteMany({
          where: { b2bProjectId: id },
        });
      }

      return tx.b2BProject.update({
        where: { id },
        data: {
          ...dto,
          name: dto.name?.trim(),
          partnerName: dto.partnerName?.trim(),
          managerComment:
            dto.managerComment === undefined
              ? undefined
              : dto.managerComment.trim() || null,
          ...(supplierChanged ? { status: B2BProjectStatus.DRAFT } : {}),
        },
        include: projectDetailInclude,
      });
    });
  }

  async getCatalog(id: string, query: B2BProjectCatalogQueryDto) {
    const project = await this.requireProject(id);
    const where: Prisma.ProductWhereInput = {
      supplierId: project.supplierId,
      isActive: true,
      isAiEligible: true,
      stockStatus: StockStatus.IN_STOCK,
      imageUrls: { isEmpty: false },
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { externalId: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { title: 'asc' },
        take: query.limit,
        skip: query.offset,
        include: { supplier: true },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { items, total, limit: query.limit, offset: query.offset };
  }

  async replaceProducts(id: string, productIds: string[]) {
    const project = await this.requireProject(id);
    this.requireMutable(project.status);

    const products = await this.loadValidProducts(project.supplierId, productIds);
    const byId = new Map(products.map((product) => [product.id, product]));
    const ordered = productIds.map((productId) => byId.get(productId)!);

    await this.prisma.$transaction(async (tx) => {
      await tx.b2BProjectProduct.deleteMany({
        where: { b2bProjectId: id },
      });
      await tx.b2BProjectProduct.createMany({
        data: ordered.map((product, sortOrder) => ({
          b2bProjectId: id,
          productId: product.id,
          sortOrder,
          productSnapshot: this.createProductSnapshot(product),
        })),
      });
      await tx.b2BProject.update({
        where: { id },
        data: { status: B2BProjectStatus.READY_TO_GENERATE },
      });
    });

    return this.getById(id);
  }

  async startGeneration(id: string, managerId: string) {
    const project = await this.prisma.b2BProject.findUnique({
      where: { id },
      include: {
        products: {
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
        },
      },
    });
    if (!project) throw new NotFoundException('B2B project not found');
    if (project.status !== B2BProjectStatus.READY_TO_GENERATE) {
      throw new ConflictException('Project is not ready for generation');
    }

    const productIds = project.products.map(({ productId }) => productId);
    await this.loadValidProducts(project.supplierId, productIds);

    const result = await this.prisma.$transaction(async (tx) => {
      const roomProject = project.roomProjectId
        ? await tx.roomProject.update({
            where: { id: project.roomProjectId },
            data: { status: RoomProjectStatus.READY_TO_GENERATE },
          })
        : await tx.roomProject.create({
            data: {
              ownerType: GenerationOwnerType.USER,
              userId: managerId,
              title: `${project.partnerName} · ${project.name}`,
              roomType: project.roomType,
              style: project.style,
              status: RoomProjectStatus.READY_TO_GENERATE,
            },
          });

      const job = await tx.generationJob.create({
        data: {
          ownerType: GenerationOwnerType.USER,
          userId: managerId,
          roomProjectId: roomProject.id,
          provider: this.getDefaultGenerationProvider(),
          status: GenerationJobStatus.PENDING,
          scenario: GenerationScenario.B2B_FURNITURE_LINE,
          requestedVariants: 2,
          inputParams: {
            b2bProjectId: project.id,
            productIds,
          },
        },
      });

      await tx.b2BProject.update({
        where: { id },
        data: {
          roomProjectId: roomProject.id,
          status: B2BProjectStatus.GENERATING,
        },
      });

      return { project: roomProject, job };
    });

    try {
      await this.generationQueueService.enqueueGeneration(result.job.id);
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.b2BProject.update({
          where: { id },
          data: { status: B2BProjectStatus.FAILED },
        }),
        this.prisma.generationJob.update({
          where: { id: result.job.id },
          data: {
            status: GenerationJobStatus.FAILED,
            errorMessage: 'Failed to enqueue generation',
          },
        }),
      ]);
      throw error;
    }

    return result;
  }

  private async requireProject(id: string) {
    const project = await this.prisma.b2BProject.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('B2B project not found');
    return project;
  }

  private async requireActiveSupplier(supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, status: SupplierStatus.ACTIVE },
      select: { id: true },
    });
    if (!supplier) throw new BadRequestException('Active supplier not found');
  }

  private requireMutable(status: B2BProjectStatus) {
    if (
      status === B2BProjectStatus.GENERATING ||
      status === B2BProjectStatus.COMPLETED
    ) {
      throw new ConflictException('Generated project cannot be changed');
    }
  }

  private async loadValidProducts(supplierId: string, productIds: string[]) {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length < 1 || uniqueIds.length > 6) {
      throw new BadRequestException('Choose between 1 and 6 products');
    }
    if (uniqueIds.length !== productIds.length) {
      throw new BadRequestException('Product selection must be unique');
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        supplierId,
        isActive: true,
        isAiEligible: true,
        stockStatus: StockStatus.IN_STOCK,
        imageUrls: { isEmpty: false },
      },
    });
    if (
      products.length !== uniqueIds.length ||
      products.some(
        (product) =>
          product.supplierId !== supplierId ||
          !product.isActive ||
          !product.isAiEligible ||
          product.stockStatus !== StockStatus.IN_STOCK ||
          product.imageUrls.length === 0,
      )
    ) {
      throw new BadRequestException(
        'Every product must be active, AI-eligible, in stock, illustrated, and from the project supplier',
      );
    }
    return products;
  }

  private createProductSnapshot(
    product: Awaited<ReturnType<B2BProjectsService['loadValidProducts']>>[number],
  ): Prisma.InputJsonObject {
    return {
      id: product.id,
      supplierId: product.supplierId,
      externalId: product.externalId,
      title: product.title,
      category: product.category,
      price: product.price,
      oldPrice: product.oldPrice,
      currency: product.currency,
      stockStatus: product.stockStatus,
      imageUrls: product.imageUrls,
      productUrl: product.productUrl,
      widthCm: product.widthCm,
      heightCm: product.heightCm,
      depthCm: product.depthCm,
      material: product.material,
      color: product.color,
    };
  }

  private getDefaultGenerationProvider(): GenerationProvider {
    const value = process.env.GENERATION_PROVIDER ?? 'MOCK';
    if (value === 'NANO_BANANA') return GenerationProvider.NANO_BANANA;
    if (value === 'MOCK') return GenerationProvider.MOCK;
    throw new Error(`Unsupported GENERATION_PROVIDER: ${value}`);
  }
}
