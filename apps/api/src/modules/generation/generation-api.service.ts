import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  GenerationJobStatus,
  GenerationOwnerType,
  GenerationProvider,
  Prisma,
  RoomProjectStatus,
} from '@roomvi/database';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { GenerationQueueService } from '../generation-queue/generation-queue.service.js';
import { GuestService } from '../guest/guest.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateGenerationDto } from './dto/create-generation.dto.js';
type CreateGenerationContext = { user?: JwtUser; guestAnonymousId?: string };
@Injectable()
export class GenerationApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestService: GuestService,
    private readonly generationQueueService: GenerationQueueService,
  ) {}
  async createGeneration(
    dto: CreateGenerationDto,
    context: CreateGenerationContext,
  ) {
    if (!context.user && !context.guestAnonymousId)
      throw new UnauthorizedException('Auth or guest session required');
    const owner = await this.resolveOwner(context);
    if (owner.ownerType === GenerationOwnerType.GUEST)
      await this.guestService.incrementPreviewGenerationUsage(
        owner.guestAnonymousId,
      );
    const roomProject = await this.prisma.roomProject.create({
      data: {
        ownerType: owner.ownerType,
        userId: owner.userId,
        guestSessionId: owner.guestSessionId,
        title: dto.title ?? this.createDefaultProjectTitle(dto),
        roomType: dto.roomType,
        style: dto.style,
        budgetMin: dto.budgetMin,
        budgetMax: dto.budgetMax,
        widthCm: dto.widthCm,
        heightCm: dto.heightCm,
        depthCm: dto.depthCm,
        sourceImageUrl: dto.sourceImageUrl,
        status: RoomProjectStatus.READY_TO_GENERATE,
      },
    });
    const generationJob = await this.prisma.generationJob.create({
      data: {
        ownerType: owner.ownerType,
        userId: owner.userId,
        guestSessionId: owner.guestSessionId,
        roomProjectId: roomProject.id,
        provider: this.getDefaultGenerationProvider(),
        status: GenerationJobStatus.PENDING,
        inputParams: { ...dto } as Prisma.InputJsonObject,
        startedAt: null,
        completedAt: null,
      },
    });
    await this.generationQueueService.enqueueGeneration(generationJob.id);
    return { project: roomProject, job: generationJob };
  }
  async getGenerationJob(jobId: string, context: CreateGenerationContext) {
    const job = await this.prisma.generationJob.findUnique({
      where: { id: jobId },
      include: {
        roomProject: true,
        designVariants: {
          include: { products: { include: { product: true } } },
        },
      },
    });
    if (!job) throw new NotFoundException('Generation job not found');
    if (context.user && job.userId === context.user.userId) return job;
    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );
      if (guestSession && job.guestSessionId === guestSession.id) return job;
    }
    throw new UnauthorizedException('No access to this generation job');
  }
  async getProject(projectId: string, context: CreateGenerationContext) {
    const project = await this.prisma.roomProject.findUnique({
      where: { id: projectId },
      include: {
        designVariants: {
          include: { products: { include: { product: true } } },
        },
        generationJobs: true,
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    if (context.user && project.userId === context.user.userId) return project;
    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );
      if (guestSession && project.guestSessionId === guestSession.id)
        return project;
    }
    throw new UnauthorizedException('No access to this project');
  }
  async listMyProjects(context: CreateGenerationContext) {
    if (context.user)
      return this.prisma.roomProject.findMany({
        where: { userId: context.user.userId },
        orderBy: { createdAt: 'desc' },
        include: { designVariants: { take: 1, orderBy: { createdAt: 'asc' } } },
      });
    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );
      if (!guestSession)
        throw new UnauthorizedException('Invalid guest session');
      return this.prisma.roomProject.findMany({
        where: { guestSessionId: guestSession.id },
        orderBy: { createdAt: 'desc' },
        include: { designVariants: { take: 1, orderBy: { createdAt: 'asc' } } },
      });
    }
    throw new UnauthorizedException('Auth or guest session required');
  }
  private async resolveOwner(context: CreateGenerationContext) {
    if (context.user)
      return {
        ownerType: GenerationOwnerType.USER,
        userId: context.user.userId,
        guestSessionId: undefined,
        guestAnonymousId: undefined as never,
      };
    if (!context.guestAnonymousId)
      throw new UnauthorizedException('Guest session required');
    const guestSession = await this.guestService.findValidSessionByAnonymousId(
      context.guestAnonymousId,
    );
    if (!guestSession) throw new UnauthorizedException('Invalid guest session');
    return {
      ownerType: GenerationOwnerType.GUEST,
      userId: undefined,
      guestSessionId: guestSession.id,
      guestAnonymousId: guestSession.anonymousId,
    };
  }
  private createDefaultProjectTitle(dto: CreateGenerationDto) {
    return `${dto.roomType} · ${dto.style}`;
  }

  private getDefaultGenerationProvider(): GenerationProvider {
    const value = process.env.GENERATION_PROVIDER ?? 'MOCK';

    if (value === 'NANO_BANANA') return GenerationProvider.NANO_BANANA;
    if (value === 'MOCK') return GenerationProvider.MOCK;

    throw new Error(`Unsupported GENERATION_PROVIDER: ${value}`);
  }
}
