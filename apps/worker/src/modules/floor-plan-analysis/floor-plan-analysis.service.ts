import { Injectable } from '@nestjs/common';
import {
  B2BAnalysisStatus,
  B2BProjectStatus,
  B2BProjectType,
  B2BRoomStatus,
  Prisma,
} from '@roomvi/database';
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

  async process(analysisRunId: string): Promise<void> {
    const run = await this.prisma.floorPlanAnalysisRun.findUnique({
      where: { id: analysisRunId },
      include: { b2bProject: true },
    });
    if (!run) throw new Error('Floor-plan analysis run not found');
    if (run.status === B2BAnalysisStatus.COMPLETED) return;
    if (
      run.b2bProject.type !== B2BProjectType.DEVELOPER_FLOOR_PLAN ||
      !run.b2bProject.sourceImageUrl
    ) {
      throw new Error('Floor-plan analysis project is invalid');
    }

    const claimed = await this.prisma.floorPlanAnalysisRun.updateMany({
      where: {
        id: analysisRunId,
        status: {
          in: [B2BAnalysisStatus.PENDING, B2BAnalysisStatus.FAILED],
        },
      },
      data: {
        status: B2BAnalysisStatus.PROCESSING,
        progress: 10,
        currentStep: 'Подготавливаем планировку',
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      },
    });
    if (claimed.count !== 1) return;

    await this.prisma.b2BProject.updateMany({
      where: {
        id: run.b2bProjectId,
        type: B2BProjectType.DEVELOPER_FLOOR_PLAN,
      },
      data: { status: B2BProjectStatus.ANALYZING },
    });

    try {
      const attachment = await this.assetService.loadNormalizedImage(
        run.b2bProject.sourceImageUrl,
      );
      await this.prisma.floorPlanAnalysisRun.updateMany({
        where: {
          id: analysisRunId,
          status: B2BAnalysisStatus.PROCESSING,
        },
        data: {
          progress: 35,
          currentStep: 'Распознаём комнаты, размеры и окна',
        },
      });

      const analysis = await this.analyzer.analyze(attachment);
      await this.prisma.$transaction(async (tx) => {
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

        await tx.floorPlanAnalysisRun.update({
          where: { id: analysisRunId },
          data: {
            status: B2BAnalysisStatus.COMPLETED,
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
        await tx.b2BProject.update({
          where: { id: run.b2bProjectId },
          data: {
            status: B2BProjectStatus.REVIEW_REQUIRED,
            roomsRevision: { increment: 1 },
          },
        });
      });
    } catch {
      await Promise.all([
        this.prisma.floorPlanAnalysisRun.update({
          where: { id: analysisRunId },
          data: {
            status: B2BAnalysisStatus.FAILED,
            progress: 100,
            currentStep: 'Анализ не выполнен',
            errorMessage: 'Floor-plan analysis failed',
            completedAt: new Date(),
          },
        }),
        this.prisma.b2BProject.updateMany({
          where: {
            id: run.b2bProjectId,
            status: B2BProjectStatus.ANALYZING,
          },
          data: { status: B2BProjectStatus.FAILED },
        }),
      ]);
      throw new Error('Floor-plan analysis failed');
    }
  }
}
