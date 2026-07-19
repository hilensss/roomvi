import {
  BadGatewayException,
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
import { Readable, Transform } from 'node:stream';
import { GenerationQueueService } from '../generation-queue/generation-queue.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { B2BProjectCatalogQueryDto } from './dto/b2b-project-catalog-query.dto.js';
import { CreateB2BProjectDto } from './dto/create-b2b-project.dto.js';
import { ListB2BProjectsQueryDto } from './dto/list-b2b-projects-query.dto.js';
import { UpdateB2BProjectDto } from './dto/update-b2b-project.dto.js';

const mutableProjectStatuses = [
  B2BProjectStatus.DRAFT,
  B2BProjectStatus.READY_TO_GENERATE,
  B2BProjectStatus.FAILED,
] as const;
const DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;

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
        sourceImageUrl: dto.sourceImageUrl ?? null,
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
    const currentProject = await this.requireProject(id);
    if (dto.supplierId) await this.requireActiveSupplier(dto.supplierId);
    const supplierChanged =
      dto.supplierId !== undefined &&
      dto.supplierId !== currentProject.supplierId;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.b2BProject.updateMany({
        where: {
          id,
          supplierId: currentProject.supplierId,
          status: { in: [...mutableProjectStatuses] },
        },
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
      });
      if (updated.count !== 1) {
        await this.throwProjectMutationConflict(tx, id);
      }

      if (supplierChanged) {
        await tx.b2BProjectProduct.deleteMany({
          where: { b2bProjectId: id },
        });
      }

      const project = await tx.b2BProject.findUnique({
        where: { id },
        include: projectDetailInclude,
      });
      if (!project) throw new NotFoundException('B2B project not found');
      return project;
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
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.b2BProject.updateMany({
        where: { id, status: { in: [...mutableProjectStatuses] } },
        data: { status: B2BProjectStatus.DRAFT },
      });
      if (claimed.count !== 1) {
        await this.throwProjectMutationConflict(tx, id);
      }

      const project = await tx.b2BProject.findUnique({
        where: { id },
        select: { supplierId: true, sourceImageUrl: true },
      });
      if (!project) throw new NotFoundException('B2B project not found');
      const products = await this.loadValidProducts(
        project.supplierId,
        productIds,
        this.getProductSelectionLimit(project.sourceImageUrl),
        tx,
      );
      const byId = new Map(products.map((product) => [product.id, product]));
      const ordered = productIds.map((productId) => byId.get(productId)!);

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
      return tx.b2BProject.update({
        where: { id },
        data: { status: B2BProjectStatus.READY_TO_GENERATE },
        include: projectDetailInclude,
      });
    });
  }

  async startGeneration(id: string, managerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.b2BProject.updateMany({
        where: {
          id,
          status: {
            in: [
              B2BProjectStatus.READY_TO_GENERATE,
              B2BProjectStatus.FAILED,
            ],
          },
        },
        data: { status: B2BProjectStatus.GENERATING },
      });
      if (claimed.count !== 1) {
        await this.throwProjectMutationConflict(tx, id);
      }

      const project = await tx.b2BProject.findUnique({
        where: { id },
        include: {
          products: {
            orderBy: { sortOrder: 'asc' },
            include: { product: true },
          },
        },
      });
      if (!project) throw new NotFoundException('B2B project not found');
      const productIds = project.products.map(({ productId }) => productId);
      await this.loadValidProducts(
        project.supplierId,
        productIds,
        this.getProductSelectionLimit(project.sourceImageUrl),
        tx,
      );

      const roomProject = project.roomProjectId
        ? await tx.roomProject.update({
            where: { id: project.roomProjectId },
            data: {
              title: `${project.partnerName} · ${project.name}`,
              roomType: project.roomType,
              style: project.style,
              sourceImageUrl: project.sourceImageUrl,
              status: RoomProjectStatus.READY_TO_GENERATE,
            },
          })
        : await tx.roomProject.create({
            data: {
              ownerType: GenerationOwnerType.USER,
              userId: managerId,
              title: `${project.partnerName} · ${project.name}`,
              roomType: project.roomType,
              style: project.style,
              sourceImageUrl: project.sourceImageUrl,
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

  async downloadVariant(projectId: string, variantId: string) {
    const variant = await this.prisma.designVariant.findFirst({
      where: {
        id: variantId,
        roomProject: { b2bProject: { id: projectId } },
      },
      select: { id: true, imageUrl: true },
    });
    if (!variant) throw new NotFoundException('Design variant not found');

    const imageUrl = this.requireAllowedDownloadUrl(variant.imageUrl);
    let response: Response;
    try {
      response = await fetch(imageUrl, {
        redirect: 'error',
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('Generated image is unavailable');
    }
    if (!response.ok) {
      throw new BadGatewayException('Generated image is unavailable');
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!contentType.startsWith('image/')) {
      throw new BadGatewayException('Generated file is not an image');
    }

    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;
    if (
      contentLength !== undefined &&
      (!Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > DOWNLOAD_MAX_BYTES)
    ) {
      throw new BadGatewayException('Generated image is too large');
    }
    if (!response.body) {
      throw new BadGatewayException('Generated image is unavailable');
    }

    return {
      stream: this.createLimitedDownloadStream(response.body),
      contentType,
      fileName: `roomvi-${variant.id}.${this.getImageExtension(contentType)}`,
      contentLength,
    };
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

  private async throwProjectMutationConflict(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<never> {
    const project = await tx.b2BProject.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('B2B project not found');
    throw new ConflictException('Project cannot be changed in its current state');
  }

  private async loadValidProducts(
    supplierId: string,
    productIds: string[],
    maximumProducts: number,
    client: Pick<Prisma.TransactionClient, 'product'> = this.prisma,
  ) {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length < 1 || uniqueIds.length > maximumProducts) {
      throw new BadRequestException(
        `Choose between 1 and ${maximumProducts} products`,
      );
    }
    if (uniqueIds.length !== productIds.length) {
      throw new BadRequestException('Product selection must be unique');
    }

    const products = await client.product.findMany({
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

  private getProductSelectionLimit(sourceImageUrl?: string | null) {
    return sourceImageUrl ? 9 : 10;
  }

  private getImageExtension(contentType: string) {
    if (contentType.includes('jpeg')) return 'jpg';
    if (contentType.includes('png')) return 'png';
    if (contentType.includes('webp')) return 'webp';
    return 'bin';
  }

  private requireAllowedDownloadUrl(imageUrl: string) {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new BadGatewayException('Generated image URL is invalid');
    }

    const allowedOrigins = new Set<string>();
    const configuredOrigins = [
      process.env.S3_PUBLIC_BASE_URL,
      ...(process.env.B2B_DOWNLOAD_ALLOWED_ORIGINS?.split(',') ?? []),
    ];
    if ((process.env.GENERATION_PROVIDER ?? 'MOCK') === 'MOCK') {
      configuredOrigins.push('https://placehold.co');
    }

    for (const configured of configuredOrigins) {
      if (!configured?.trim()) continue;
      try {
        allowedOrigins.add(new URL(configured.trim()).origin);
      } catch {
        continue;
      }
    }

    if (!allowedOrigins.has(url.origin)) {
      throw new BadGatewayException('Generated image origin is not allowed');
    }

    return url;
  }

  private createLimitedDownloadStream(body: ReadableStream<Uint8Array>) {
    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > DOWNLOAD_MAX_BYTES) {
          callback(new Error('Generated image exceeded the proxy limit'));
          return;
        }
        callback(null, chunk);
      },
    });

    return Readable.fromWeb(body).pipe(limiter);
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
