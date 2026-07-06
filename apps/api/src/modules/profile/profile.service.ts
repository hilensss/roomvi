import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(userId: string) {
    const [user, projects, orders] = await this.prisma.$transaction([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          createdAt: true,
          updatedAt: true,
        },
      }),

      this.prisma.roomProject.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          designVariants: {
            orderBy: { createdAt: 'desc' },
            include: {
              products: true,
            },
          },
          generationJobs: {
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
            select: {
              id: true,
              status: true,
              createdAt: true,
            },
          },
        },
      }),

      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
        },
      }),
    ]);

    let resultProjects = projects.map((project) => ({
      ...project,
      designVariants: project.selectedDesignVariantId
        ? project.designVariants.find(
            (design) => design.id === project.selectedDesignVariantId,
          )
        : project.designVariants[0],
      latestGenerationJobId: project.generationJobs[0]?.id ?? null,
    }));

    return {
      user,
      projects: resultProjects,
      orders,
    };
  }
}
