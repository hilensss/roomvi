import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  GenerationJobStatus,
  GenerationOwnerType,
  Product,
  RoomProjectStatus,
} from '@roomvi/database';
import { CatalogReadService } from '../catalog/catalog-read.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MockAiProvider } from './providers/mock-ai.provider.js';
import { PromptBuilderService } from './prompt-builder.service.js';
import { createProductSnapshot } from './utils/product-snapshot.util.js';

@Injectable()
export class GenerationProcessingService {
  private readonly logger = new Logger(GenerationProcessingService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogReadService: CatalogReadService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly mockAiProvider: MockAiProvider,
  ) {}
  async processGenerationJob(generationJobId: string): Promise<unknown> {
    const generationJob = await this.prisma.generationJob.findUnique({
      where: { id: generationJobId },
      include: { roomProject: true },
    });
    if (!generationJob) throw new NotFoundException('Generation job not found');
    if (generationJob.status === GenerationJobStatus.COMPLETED) {
      this.logger.log(`Generation job ${generationJob.id} already completed`);
      return generationJob;
    }
    await this.prisma.generationJob.update({
      where: { id: generationJob.id },
      data: {
        status: GenerationJobStatus.PROCESSING,
        startedAt: new Date(),
        errorMessage: null,
      },
    });
    await this.prisma.roomProject.update({
      where: { id: generationJob.roomProjectId },
      data: { status: RoomProjectStatus.GENERATING },
    });
    const project = generationJob.roomProject;
    try {
      const products = await this.catalogReadService.findAiEligibleProducts({
        roomType: project.roomType,
        style: project.style,
        maxBudget: project.budgetMax ?? undefined,
        limit: 20,
      });
      if (products.length === 0)
        throw new BadRequestException(
          'No AI eligible products found for selected room/style/budget',
        );
      const prompt = this.promptBuilder.buildPrompt(
        {
          roomType: project.roomType,
          style: project.style,
          title: project.title ?? undefined,
          budgetMin: project.budgetMin ?? undefined,
          budgetMax: project.budgetMax ?? undefined,
          widthCm: project.widthCm ?? undefined,
          heightCm: project.heightCm ?? undefined,
          depthCm: project.depthCm ?? undefined,
          sourceImageUrl: project.sourceImageUrl ?? undefined,
        },
        products,
      );
      const negativePrompt = this.promptBuilder.buildNegativePrompt();
      await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: { prompt, negativePrompt },
      });
      const variantsCount =
        generationJob.ownerType === GenerationOwnerType.GUEST ? 1 : 3;
      const generatedVariants = await this.mockAiProvider.generateDesigns({
        prompt,
        negativePrompt,
        roomType: project.roomType,
        style: project.style,
        products,
        variantsCount,
        sourceImageUrl: project.sourceImageUrl ?? undefined,
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      const createdVariants = [];
      for (const generatedVariant of generatedVariants) {
        const variantProducts = generatedVariant.productIds
          .map((id) => productById.get(id))
          .filter(Boolean) as Product[];
        const totalPrice = variantProducts.reduce((sum, p) => sum + p.price, 0);
        createdVariants.push(
          await this.prisma.designVariant.create({
            data: {
              roomProjectId: project.id,
              generationJobId: generationJob.id,
              title: generatedVariant.title,
              description: generatedVariant.description,
              imageUrl: generatedVariant.imageUrl,
              totalPrice,
              currency: 'RUB',
              products: {
                create: variantProducts.map((p) => ({
                  productId: p.id,
                  role: p.category,
                  productSnapshot: createProductSnapshot(p),
                })),
              },
            },
            include: { products: { include: { product: true } } },
          }),
        );
      }
      const completedJob = await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          status: GenerationJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
      const updatedProject = await this.prisma.roomProject.update({
        where: { id: project.id },
        data: { status: RoomProjectStatus.GENERATED },
      });
      return {
        project: updatedProject,
        job: completedJob,
        variants: createdVariants,
      };
    } catch (error) {
      await this.prisma.generationJob.update({
        where: { id: generationJob.id },
        data: {
          status: GenerationJobStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Unknown generation error',
          completedAt: new Date(),
        },
      });
      await this.prisma.roomProject.update({
        where: { id: project.id },
        data: { status: RoomProjectStatus.DRAFT },
      });
      throw error;
    }
  }
}
