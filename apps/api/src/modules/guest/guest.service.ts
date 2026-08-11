import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import {
  FileOwnerType,
  GenerationOwnerType,
  GuestSession,
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

    if (session.previewGenerationsUsed >= session.previewGenerationsLimit) {
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

    return this.prisma.guestSession.update({
      where: {
        id: session.id,
      },
      data: {
        previewGenerationsUsed: {
          increment: 1,
        },
        lastSeenAt: new Date(),
      },
    });
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

    await this.prisma.$transaction([
      this.prisma.roomProject.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: GenerationOwnerType.USER,
        },
      }),

      this.prisma.generationJob.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: GenerationOwnerType.USER,
        },
      }),

      this.prisma.cart.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
        },
      }),

      this.prisma.file.updateMany({
        where: {
          guestSessionId: session.id,
          userId: null,
        },
        data: {
          userId,
          ownerType: FileOwnerType.USER,
        },
      }),

      this.prisma.guestSession.update({
        where: {
          id: session.id,
        },
        data: {
          convertedUserId: userId,
          convertedAt: new Date(),
          lastSeenAt: new Date(),
        },
      }),
    ]);
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
