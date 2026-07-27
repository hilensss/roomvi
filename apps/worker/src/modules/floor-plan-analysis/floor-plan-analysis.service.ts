import { Injectable } from '@nestjs/common';
import {
  B2BAnalysisStatus,
  B2BProjectStatus,
  B2BProjectType,
  B2BRoomStatus,
  Prisma,
} from '@roomvi/database';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { FloorPlanAnalyzerService } from './floor-plan-analyzer.service.js';
import { FloorPlanAssetService } from './floor-plan-asset.service.js';

@Injectable()
export class FloorPlanAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetService: FloorPlanAssetService,
    private readonly analyzer: FloorPlanAnalyzerService,
  ) {}

  async process(
    analysisRunId: string,
    attempt: { isRecovery: boolean; isFinalAttempt: boolean } = {
      isRecovery: false,
      isFinalAttempt: true,
    },
  ): Promise<void> {
    const run = await this.prisma.floorPlanAnalysisRun.findUnique({
      where: { id: analysisRunId },
      include: { b2bProject: true },
    });
    if (!run) throw new Error('Floor-plan analysis run not found');
    if (run.status === B2BAnalysisStatus.COMPLETED) return;
    if (
      run.b2bProject.type !== B2BProjectType.DEVELOPER_FLOOR_PLAN ||
      !run.b2bProject.sourcePlanFileId
    ) {
      throw new Error('Floor-plan analysis project is invalid');
    }

    const processingToken = randomUUID();
    const claimed = await this.prisma.floorPlanAnalysisRun.updateMany({
      where: {
        id: analysisRunId,
        status: {
          in: [
            B2BAnalysisStatus.PENDING,
            ...(attempt.isRecovery
              ? [B2BAnalysisStatus.PROCESSING]
              : []),
          ],
        },
      },
      data: {
        status: B2BAnalysisStatus.PROCESSING,
        processingToken,
        progress: 10,
        currentStep: 'Подготавливаем планировку',
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
    });
    if (claimed.count !== 1) {
      throw new Error('Floor-plan analysis run is not claimable');
    }

    await this.prisma.b2BProject.updateMany({
      where: {
        id: run.b2bProjectId,
        type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
      },
      data: { status: B2BProjectStatus.ANALYZING },
    });

    try {
      const sourceFile = await this.prisma.file.findUnique({
        where: { id: run.b2bProject.sourcePlanFileId },
        select: {
          storageKey: true,
          mimeType: true,
          sizeBytes: true,
        },
      });
      if (!sourceFile) throw new Error('Floor-plan file not found');
      const attachment = await this.assetService.loadNormalizedImage(
        sourceFile,
      );
      await this.prisma.floorPlanAnalysisRun.updateMany({
        where: {
          id: analysisRunId,
          status: B2BAnalysisStatus.PROCESSING,
          processingToken,
        },
        data: {
          progress: 35,
          currentStep: 'Распознаём комнаты, размеры и окна',
        },
      });

      const analysis = await this.analyzer.analyze(attachment);
      await this.prisma.$transaction(async (tx) => {
        const completed = await tx.floorPlanAnalysisRun.updateMany({
          where: {
            id: analysisRunId,
            status: B2BAnalysisStatus.PROCESSING,
            processingToken,
          },
          data: {
            status: B2BAnalysisStatus.COMPLETED,
            processingToken: null,
            provider: analysis.provider,
            model: analysis.model,
            progress: 100,
            currentStep: 'Комнаты готовы к проверке',
            warnings: analysis.warnings as Prisma.InputJsonValue,
            inputTokens: analysis.usage?.inputTokens,
            outputTokens: analysis.usage?.outputTokens,
            errorMessage: null,
            completedAt: new Date(),
          },
        });
        if (completed.count !== 1) {
          throw new Error('Floor-plan analysis lease was lost');
        }
        await tx.b2BRoom.deleteMany({
          where: { b2bProjectId: run.b2bProjectId },
        });
        for (const [sortOrder, room] of analysis.rooms.entries()) {
          await tx.b2BRoom.create({
            data: {
              b2bProjectId: run.b2bProjectId,
              status: B2BRoomStatus.REVIEW_REQUIRED,
              sourceLabel: room.sourceLabel,
              name: room.name,
              roomType: room.roomType,
              styleOverride: null,
              widthCm: room.widthCm,
              depthCm: room.depthCm,
              areaM2: room.areaM2,
              ceilingHeightCm: room.ceilingHeightCm,
              polygon: room.polygon as unknown as Prisma.InputJsonValue,
              recognitionConfidence: room.recognitionConfidence,
              recognitionNotes: room.recognitionNotes,
              sortOrder,
              isIncluded: true,
              openings: {
                create: room.openings.map((opening) => ({
                  kind: opening.kind,
                  wallSegmentIndex: opening.wallSegmentIndex,
                  positionRatio: opening.positionRatio,
                  widthCm: opening.widthCm,
                  recognitionConfidence: opening.recognitionConfidence,
                })),
              },
            },
          });
        }

        const projectCompleted = await tx.b2BProject.updateMany({
          where: {
            id: run.b2bProjectId,
            status: B2BProjectStatus.ANALYZING,
          },
          data: {
            status: B2BProjectStatus.REVIEW_REQUIRED,
            roomsRevision: { increment: 1 },
          },
        });
        if (projectCompleted.count !== 1) {
          throw new Error('Floor-plan analysis project state changed');
        }
      });
    } catch {
      if (!attempt.isFinalAttempt) {
        await this.prisma.floorPlanAnalysisRun.updateMany({
          where: {
            id: analysisRunId,
            status: B2BAnalysisStatus.PROCESSING,
            processingToken,
          },
          data: {
            status: B2BAnalysisStatus.PENDING,
            processingToken: null,
            progress: 0,
            currentStep: 'Повторяем анализ',
            errorMessage: null,
            completedAt: null,
          },
        });
        throw new Error('Floor-plan analysis failed');
      }
      await this.prisma.$transaction(async (tx) => {
        const failed = await tx.floorPlanAnalysisRun.updateMany({
          where: {
            id: analysisRunId,
            status: B2BAnalysisStatus.PROCESSING,
            processingToken,
          },
          data: {
            status: B2BAnalysisStatus.FAILED,
            processingToken: null,
            progress: 100,
            currentStep: 'Анализ не выполнен',
            errorMessage: 'Floor-plan analysis failed',
            completedAt: new Date(),
          },
        });
        if (failed.count !== 1) return;
        await tx.b2BProject.updateMany({
          where: {
            id: run.b2bProjectId,
            status: B2BProjectStatus.ANALYZING,
          },
          data: { status: B2BProjectStatus.FAILED },
        });
      });
      throw new Error('Floor-plan analysis failed');
    }
  }
}
