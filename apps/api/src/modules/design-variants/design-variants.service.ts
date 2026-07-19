import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { GuestService } from '../guest/guest.service.js';
import { RoomProjectStatus } from '@roomvi/database';

type AccessContext = {
  user?: JwtUser | undefined;
  guestAnonymousId?: string;
};

@Injectable()
export class DesignVariantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly guestService: GuestService,
  ) {}

  async selectDesignVariant(
    id: string,
    context: AccessContext,
  ): Promise<unknown> {
    const designVariant = await this.prisma.designVariant.findFirst({
      where: { id, roomProject: { b2bProject: null } },
      include: { roomProject: true },
    });

    if (!designVariant) throw new NotFoundException('Design variant not found');

    await this.assertProjectAccess(
      {
        userId: designVariant.roomProject.userId,
        guestSessionId: designVariant.roomProject.guestSessionId,
      },
      context,
    );

    await this.prisma.$transaction([
      this.prisma.designVariant.updateMany({
        where: {
          roomProjectId: designVariant.roomProjectId,
        },
        data: {
          isSelected: false,
        },
      }),
      this.prisma.designVariant.update({
        where: {
          id: designVariant.id,
        },
        data: {
          isSelected: true,
        },
      }),
      this.prisma.roomProject.update({
        where: {
          id: designVariant.roomProjectId,
        },
        data: {
          selectedDesignVariantId: designVariant.id,
          status: RoomProjectStatus.SELECTED,
        },
      }),
    ]);

    return await this.prisma.designVariant.findUnique({
      where: { id },
      include: { products: { include: { product: true } }, roomProject: true },
    });
  }

  async getDesignVariantById(id: string, context: AccessContext) {
    const designVariant = await this.prisma.designVariant.findFirst({
      where: { id, roomProject: { b2bProject: null } },
      include: {
        roomProject: true,
        products: {
          include: {
            product: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!designVariant) {
      throw new NotFoundException('Design variant not found');
    }

    await this.assertProjectAccess(
      {
        userId: designVariant.roomProject.userId,
        guestSessionId: designVariant.roomProject.guestSessionId,
      },
      context,
    );

    return designVariant;
  }

  private async assertProjectAccess(
    project: {
      userId: string | null;
      guestSessionId: string | null;
    },
    context: AccessContext,
  ) {
    if (context.user && context.user.userId === project.userId) return;

    if (context.guestAnonymousId) {
      const guestSession =
        await this.guestService.findValidSessionByAnonymousId(
          context.guestAnonymousId,
        );

      if (guestSession && guestSession.id === project.guestSessionId) return;
    }

    throw new UnauthorizedException('No access to this design variant');
  }
}
