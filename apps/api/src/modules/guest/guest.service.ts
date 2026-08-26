import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  CartStatus,
  FileOwnerType,
  GenerationOwnerType,
  GuestSession,
  Prisma,
  StockStatus,
} from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { GUEST_COOKIE_NAMES } from './constants/guest-cookies.constants.js';
import { GuestSessionResponse } from './types/guest-session-response.type.js';
import { hashGuestMeta } from './utils/guest-hash.util.js';
@Injectable()
export class GuestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}
  async getOrCreateSession(
    req: Request,
    res: Response,
  ): Promise<GuestSessionResponse> {
    const anonymousId = req.cookies?.[GUEST_COOKIE_NAMES.guestId];
    const existing = anonymousId
      ? await this.findValidSessionByAnonymousId(anonymousId)
      : null;
    if (existing) {
      const updated = await this.touchSession(existing.id);
      this.setGuestCookie(res, updated.anonymousId, updated.expiresAt);
      return this.toResponse(updated);
    }
    const session = await this.createSession(req);
    this.setGuestCookie(res, session.anonymousId, session.expiresAt);
    return this.toResponse(session);
  }
  async findValidSessionByAnonymousId(anonymousId: string) {
    const session = await this.prisma.guestSession.findUnique({
      where: { anonymousId },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() < Date.now()) return null;
    if (session.convertedUserId) return null;
    return session;
  }
  async incrementPreviewGenerationUsage(
    anonymousId: string,
  ): Promise<GuestSession> {
    const session = await this.findValidSessionByAnonymousId(anonymousId);

    if (!session) {
      throw new NotFoundException('Guest session not found or expired');
    }

    const now = new Date();
    const claimed = await this.prisma.guestSession.updateMany({
      where: {
        id: session.id,
        convertedUserId: null,
        expiresAt: { gt: now },
        previewGenerationsUsed: { lt: session.previewGenerationsLimit },
      },
      data: {
        previewGenerationsUsed: { increment: 1 },
        lastSeenAt: now,
      },
    });

    const updated = await this.prisma.guestSession.findUnique({
      where: { id: session.id },
    });

    if (
      !updated ||
      updated.convertedUserId ||
      updated.expiresAt.getTime() < Date.now()
    ) {
      throw new NotFoundException('Guest session not found or expired');
    }

    if (claimed.count !== 1) {
      this.throwPreviewGenerationLimitExceeded(updated);
    }

    return updated;
  }

  async attachGuestSessionToUser(
    anonymousId: string | undefined,
    userId: string,
  ): Promise<void> {
    if (!anonymousId) {
      return;
    }

    const session = await this.findValidSessionByAnonymousId(anonymousId);

    if (!session) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const convertedAt = new Date();
      const claimed = await tx.guestSession.updateMany({
        where: {
          id: session.id,
          convertedUserId: null,
          expiresAt: { gt: convertedAt },
        },
        data: {
          convertedUserId: userId,
          convertedAt,
          lastSeenAt: convertedAt,
        },
      });

      if (claimed.count !== 1) {
        return;
      }

      await this.mergeActiveGuestCarts(tx, session.id, userId);

      await tx.roomProject.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: GenerationOwnerType.USER,
        },
      });

      await tx.generationJob.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: GenerationOwnerType.USER,
        },
      });

      await tx.cart.updateMany({
        where: {
          guestSessionId: session.id,
        },
        data: {
          userId,
          guestSessionId: null,
        },
      });

      await tx.file.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: FileOwnerType.USER,
        },
      });
    });
  }
  clearGuestCookie(res: Response) {
    res.clearCookie(GUEST_COOKIE_NAMES.guestId, this.getGuestCookieOptions());
  }
  private async createSession(req: Request) {
    const now = new Date();
    const expiresAt = this.calculateGuestSessionExpiresAt();
    const salt = this.configService.get<string>('GUEST_HASH_SALT') ?? '';
    return this.prisma.guestSession.create({
      data: {
        ipHash: hashGuestMeta(this.extractIp(req), salt),
        userAgentHash: hashGuestMeta(req.headers['user-agent'], salt),
        previewGenerationsUsed: 0,
        previewGenerationsLimit: this.getPreviewGenerationLimit(),
        firstSeenAt: now,
        lastSeenAt: now,
        expiresAt,
      },
    });
  }
  private async touchSession(sessionId: string) {
    return this.prisma.guestSession.update({
      where: { id: sessionId },
      data: { lastSeenAt: new Date() },
    });
  }
  private setGuestCookie(res: Response, anonymousId: string, expiresAt: Date) {
    res.cookie(GUEST_COOKIE_NAMES.guestId, anonymousId, {
      ...this.getGuestCookieOptions(),
      expires: expiresAt,
    });
  }
  private getGuestCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: this.configService.get<string>('COOKIE_PATH') ?? '/',
    };
  }
  private calculateGuestSessionExpiresAt() {
    const d = new Date();
    d.setDate(
      d.getDate() +
        Number(this.configService.get<string>('GUEST_SESSION_TTL_DAYS') ?? 7),
    );
    return d;
  }
  private getPreviewGenerationLimit() {
    return Number(
      this.configService.get<string>('GUEST_PREVIEW_GENERATION_LIMIT') ?? 1,
    );
  }

  private async mergeActiveGuestCarts(
    tx: Prisma.TransactionClient,
    guestSessionId: string,
    userId: string,
  ) {
    const guestCarts = await tx.cart.findMany({
      where: {
        guestSessionId,
        status: CartStatus.ACTIVE,
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    if (guestCarts.length === 0) {
      return;
    }

    const userCart = await tx.cart.findFirst({
      where: {
        userId,
        status: CartStatus.ACTIVE,
      },
      orderBy: { createdAt: 'desc' },
    });
    const targetCart = userCart ?? guestCarts[0];

    if (!targetCart) {
      return;
    }

    for (const sourceCart of guestCarts) {
      if (sourceCart.id === targetCart.id) {
        continue;
      }

      for (const sourceItem of sourceCart.items) {
        await tx.cartItem.upsert({
          where: {
            cartId_productId: {
              cartId: targetCart.id,
              productId: sourceItem.productId,
            },
          },
          update: { quantity: { increment: sourceItem.quantity } },
          create: {
            cartId: targetCart.id,
            productId: sourceItem.productId,
            supplierId: sourceItem.supplierId,
            source: sourceItem.source,
            roomProjectId: sourceItem.roomProjectId,
            designVariantId: sourceItem.designVariantId,
            quantity: sourceItem.quantity,
            priceSnapshot: sourceItem.priceSnapshot,
            titleSnapshot: sourceItem.titleSnapshot,
            imageSnapshot: sourceItem.imageSnapshot,
            availabilitySnapshot: sourceItem.availabilitySnapshot,
          },
        });
        await tx.cartItem.delete({ where: { id: sourceItem.id } });
      }

      await tx.cart.update({
        where: { id: sourceCart.id },
        data: { status: CartStatus.ABANDONED, totalAmount: 0 },
      });
    }

    const targetItems = await tx.cartItem.findMany({
      where: { cartId: targetCart.id },
      include: { product: true },
    });
    const totalAmount = targetItems.reduce((sum, item) => {
      if (
        !item.product.isActive ||
        item.product.stockStatus !== StockStatus.IN_STOCK
      ) {
        return sum;
      }

      return sum + item.priceSnapshot * item.quantity;
    }, 0);

    await tx.cart.update({
      where: { id: targetCart.id },
      data: { totalAmount },
    });
  }

  private throwPreviewGenerationLimitExceeded(session: GuestSession): never {
    throw new HttpException(
      {
        code: 'GUEST_GENERATION_LIMIT_EXCEEDED',
        message: 'Guest preview generation limit exceeded',
        previewGenerationsUsed: session.previewGenerationsUsed,
        previewGenerationsLimit: session.previewGenerationsLimit,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  private extractIp(req: Request) {
    const f = req.headers['x-forwarded-for'];
    if (typeof f === 'string') return f.split(',')[0]?.trim() ?? null;
    if (Array.isArray(f)) return f[0] ?? null;
    return req.ip ?? req.socket.remoteAddress ?? null;
  }
  private toResponse(session: GuestSession): GuestSessionResponse {
    return {
      isGuest: true,
      anonymousId: session.anonymousId,
      previewGenerationsUsed: session.previewGenerationsUsed,
      previewGenerationsLimit: session.previewGenerationsLimit,
      canGeneratePreview:
        session.previewGenerationsUsed < session.previewGenerationsLimit,
      expiresAt: session.expiresAt,
    };
  }
}
