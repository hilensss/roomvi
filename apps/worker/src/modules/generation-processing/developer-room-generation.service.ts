import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  B2BProjectStatus,
  B2BRoomStatus,
  GenerationJobStatus,
  GenerationScenario,
  InteriorStyle,
  Product,
  RoomType,
  RoomProjectStatus,
} from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AiProviderFactory } from './providers/ai-provider.factory.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { RoomShellRendererService } from './room-shell-renderer.service.js';
import { createProductSnapshot } from './utils/product-snapshot.util.js';
import { ProductCurationService } from './product-curation.service.js';
import { allowEmptyCommercialSet } from './b2b-generation-policy.js';

@Injectable()
export class DeveloperRoomGenerationService {
  private readonly logger = new Logger(DeveloperRoomGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly aiProviderFactory: AiProviderFactory,
    private readonly shellRenderer: RoomShellRendererService,
    private readonly productCurationService: ProductCurationService,
  ) {}

  async processGenerationJob(generationJobId: string): Promise<unknown> {
    const totalStartedAt = Date.now();
    let geometryMs = 0;
    let matchingMs = 0;
    let promptMs = 0;
    let furnishProviderMs = 0;
    let persistMs = 0;
    const job = await this.prisma.generationJob.findUnique({
      where: { id: generationJobId },
      include: {
        roomProject: true,
        b2bRoom: {
          include: { openings: true, b2bProject: true },
        },
      },
    });
    if (!job) throw new NotFoundException('Generation job not found');
    if (job.status === GenerationJobStatus.COMPLETED) return job;
    if (
      job.scenario !== GenerationScenario.B2B_DEVELOPER_ROOM ||
      job.requestedVariants !== 1 ||
      !job.b2bRoom
    ) {
      throw new BadRequestException('Invalid developer room generation job');
    }

    const room = job.b2bRoom;
    if (!room.roomType) {
      throw new BadRequestException('Developer room requires a room type');
    }
    const project = room.b2bProject;
    const roomProject = job.roomProject;
    const roomType = room.roomType;
    const style = room.styleOverride ?? project.style;
    const ceilingHeightCm =
      room.ceilingHeightCm ?? project.defaultCeilingHeightCm;

    await Promise.all([
      this.prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationJobStatus.PROCESSING,
          progress: 1,
          currentStep: 'Готовим геометрию комнаты',
          startedAt: new Date(),
          errorMessage: null,
        },
      }),
      this.prisma.roomProject.update({
        where: { id: roomProject.id },
        data: { status: RoomProjectStatus.GENERATING },
      }),
      this.prisma.b2BRoom.update({
        where: { id: room.id },
        data: { status: B2BRoomStatus.GENERATING },
      }),
    ]);

    try {
      await this.updateProgress(job.id, {
        progress: 3,
        currentStep: 'Подбираем товары для комнаты',
      });
      const matchingStartedAt = Date.now();
      const productSet = await this.productCurationService.getDeveloperRoomPlan({
        projectId: project.id,
        roomId: room.id,
        generationJobId: job.id,
      });
      matchingMs = Date.now() - matchingStartedAt;
      if (
        productSet.products.length === 0 &&
        !allowEmptyCommercialSet(
          roomType,
          productSet.scenePlan.nonCommercialContext ?? [],
        )
      ) {
        throw new BadRequestException(
          'No matching products were found for the room',
        );
      }

      const geometryStartedAt = Date.now();
      const shell = await this.shellRenderer.prepareShell({
        room,
        projectId: project.id,
        defaultCeilingHeightCm: project.defaultCeilingHeightCm,
      });
      geometryMs = Date.now() - geometryStartedAt;
      const shellUrl = shell.url;
      if (
        room.shellFileId !== shell.url ||
        room.shellGeometryFingerprint !== shell.fingerprint
      ) {
        await this.prisma.b2BRoom.update({
          where: { id: room.id },
          data: {
            shellFileId: shellUrl,
            shellGeometryFingerprint: shell.fingerprint,
          },
        });
      }

      const aiProvider = this.aiProviderFactory.getProvider(job.provider);

      await this.updateProgress(job.id, {
        progress: 45,
        currentStep: 'Готовим меблировку комнаты',
      });

      const promptStartedAt = Date.now();
      const promptResult = this.promptBuilder.buildDeveloperPromptWithinLimit(
        {
          roomType,
          style,
          title: room.name,
          widthCm: room.widthCm ?? undefined,
          heightCm: ceilingHeightCm,
          depthCm: room.depthCm ?? undefined,
          sourceImageUrl: shellUrl,
          scenePlan: productSet.scenePlan,
          spatialProfile: productSet.spatialProfile,
        },
        productSet.products,
        8200,
      );
      const prompt = promptResult.prompt;
      const negativePrompt = this.promptBuilder.buildNegativePrompt(
        {
          roomType,
          style,
          title: room.name,
          widthCm: room.widthCm ?? undefined,
          heightCm: ceilingHeightCm,
          depthCm: room.depthCm ?? undefined,
          sourceImageUrl: shellUrl,
          scenePlan: productSet.scenePlan,
          spatialProfile: productSet.spatialProfile,
        },
        productSet.products,
      );
      promptMs = Date.now() - promptStartedAt;
      this.logger.log(
        `B2B room prompt prepared: projectId=${project.id}, roomId=${room.id}, mode=${promptResult.mode}, length=${prompt.length}, products=${promptResult.includedProductsCount}/${promptResult.totalProductsCount}, promptMs=${promptMs}`,
      );
      const furnishProviderStartedAt = Date.now();
      const variants = await aiProvider.generateDesigns({
        prompt,
        negativePrompt,
        roomType,
        style,
        products: productSet.products,
        variantsCount: 1,
        sourceImageUrl: shellUrl,
        sourceShell: true,
        b2bRoomId: room.id,
        customerId: `${job.id}_furnished`,
        onProgress: (progress) =>
          this.updateProgress(job.id, {
            progress: 50 + Math.round(progress.progress * 0.4),
            currentStep: 'Меблируем подтверждённую геометрию',
            externalJobId: progress.externalJobId,
          }),
      });
      furnishProviderMs = Date.now() - furnishProviderStartedAt;
      if (variants.length !== 1 || !variants[0]?.imageUrl) {
        throw new BadRequestException(
          'Room furnishing must return exactly one image',
        );
      }

      const persistStartedAt = Date.now();
      const createdVariant = await this.createVariant({
        generationJobId: job.id,
        roomProjectId: roomProject.id,
        roomName: room.name,
        imageUrl: variants[0].imageUrl,
        description: variants[0].description,
        products: productSet.products,
      });
      const [completedJob, completedProject] = await Promise.all([
        this.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: GenerationJobStatus.COMPLETED,
            progress: 100,
            currentStep: 'Готово',
            completedAt: new Date(),
          },
        }),
        this.prisma.roomProject.update({
          where: { id: roomProject.id },
          data: {
            sourceImageUrl: shellUrl,
            status: RoomProjectStatus.GENERATED,
          },
        }),
        this.prisma.b2BRoom.update({
          where: { id: room.id },
          data: { status: B2BRoomStatus.GENERATED },
        }),
      ]);
      await this.aggregateProjectStatus(project.id);
      persistMs = Date.now() - persistStartedAt;
      this.logger.log(
        `B2B room generation completed: projectId=${project.id}, roomId=${room.id}, geometryMs=${geometryMs}, matchingMs=${matchingMs}, promptMs=${promptMs}, furnishProviderMs=${furnishProviderMs}, persistMs=${persistMs}, totalMs=${Date.now() - totalStartedAt}`,
      );
      return {
        project: completedProject,
        job: completedJob,
        variants: [createdVariant],
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown generation error';
      this.logger.error(
        `Developer room generation failed: jobId=${job.id}, roomId=${room.id}, reason=${message}`,
      );
      await Promise.all([
        this.prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: GenerationJobStatus.FAILED,
            progress: 100,
            currentStep: 'Ошибка генерации комнаты',
            errorMessage: message,
            completedAt: new Date(),
          },
        }),
        this.prisma.roomProject.update({
          where: { id: roomProject.id },
          data: { status: RoomProjectStatus.DRAFT },
        }),
        this.prisma.b2BRoom.update({
          where: { id: room.id },
          data: { status: B2BRoomStatus.FAILED },
        }),
      ]);
      await this.aggregateProjectStatus(project.id);
      throw error;
    }
  }

  private async createVariant(input: {
    generationJobId: string;
    roomProjectId: string;
    roomName: string;
    imageUrl: string;
    description?: string;
    products: Product[];
  }) {
    const totalPrice = input.products.reduce(
      (total, product) => total + product.price,
      0,
    );
    return this.prisma.designVariant.create({
      data: {
        roomProjectId: input.roomProjectId,
        generationJobId: input.generationJobId,
        title: input.roomName,
        description: input.description,
        imageUrl: input.imageUrl,
        totalPrice,
        currency: 'RUB',
        products: {
          create: input.products.map((product) => ({
            productId: product.id,
            role: product.category,
            productSnapshot: createProductSnapshot(product),
          })),
        },
      },
      include: { products: { include: { product: true } } },
    });
  }

  private async updateProgress(
    jobId: string,
    update: {
      progress: number;
      currentStep: string;
      externalJobId?: string;
    },
  ) {
    await this.prisma.generationJob.update({
      where: { id: jobId },
      data: update,
    });
  }

  private async aggregateProjectStatus(projectId: string) {
    const rooms = await this.prisma.b2BRoom.findMany({
      where: { b2bProjectId: projectId, isIncluded: true },
      select: {
        status: true,
        generationJobs: {
          where: { scenario: GenerationScenario.B2B_DEVELOPER_ROOM },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { startedAt: true },
        },
      },
    });
    const generated = rooms.filter(
      ({ status }) => status === B2BRoomStatus.GENERATED,
    ).length;
    const active = rooms.some(
      ({ status }) =>
        status === B2BRoomStatus.READY_TO_GENERATE ||
        status === B2BRoomStatus.GENERATING,
    );
    const status = active
      ? B2BProjectStatus.GENERATING
      : generated === rooms.length && rooms.length > 0
        ? B2BProjectStatus.COMPLETED
        : generated > 0
          ? B2BProjectStatus.PARTIALLY_COMPLETED
          : B2BProjectStatus.FAILED;
    await this.prisma.b2BProject.update({
      where: { id: projectId },
      data: { status },
    });

    if (!active) {
      const startedAtValues = rooms
        .flatMap(({ generationJobs }) => generationJobs ?? [])
        .map(({ startedAt }) => startedAt?.getTime())
        .filter((value): value is number => value !== undefined);

      if (startedAtValues.length > 0) {
        this.logger.log(
          `B2B project generation completed: projectId=${projectId}, status=${status}, rooms=${rooms.length}, generated=${generated}, totalMs=${Date.now() - Math.min(...startedAtValues)}`,
        );
      }
    }
  }
}
