import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { User } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AUTH_COOKIE_NAMES } from './constants/auth-cookies.constants.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { comparePassword, hashPassword } from './utils/password.util.js';
import {
  calculateRefreshTokenExpiresAt,
  compareToken,
  createTokenJti,
  hashToken,
} from './utils/token.util.js';
@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}
  async register(dto: RegisterDto) {
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash: await hashPassword(dto.password),
      name: dto.name,
      phone: dto.phone,
    });
    const tokens = await this.createAuthTokens(user);
    return { user: this.toPublicUser(user), tokens };
  }
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await comparePassword(dto.password, user.passwordHash)))
      throw new UnauthorizedException('Invalid email or password');
    const tokens = await this.createAuthTokens(user);
    return { user: this.toPublicUser(user), tokens };
  }
  async refreshByToken(refreshToken?: string) {
    if (!refreshToken)
      throw new UnauthorizedException('Refresh token is required');
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const session = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now()
    )
      throw new UnauthorizedException('Refresh token revoked or expired');
    if (!(await compareToken(refreshToken, session.tokenHash)))
      throw new UnauthorizedException('Invalid refresh token');
    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.createAuthTokens(session.user);
    return { user: this.toPublicUser(session.user), tokens };
  }
  async logoutByToken(refreshToken?: string) {
    if (!refreshToken) return;
    try {
      const payload = await this.jwtService.verifyAsync<{ jti: string }>(
        refreshToken,
        { secret: this.getRequiredEnv('JWT_REFRESH_SECRET') },
      );
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      return;
    }
  }
  async getMe(userId: string) {
    return this.usersService.findPublicById(userId);
  }
  setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    res.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
      ...this.getCookieOptions(),
      maxAge: Number(
        this.configService.get<string>('ACCESS_TOKEN_COOKIE_MAX_AGE_MS') ??
          900000,
      ),
    });
    res.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
      ...this.getCookieOptions(),
      maxAge: Number(
        this.configService.get<string>('REFRESH_TOKEN_COOKIE_MAX_AGE_MS') ??
          2592000000,
      ),
    });
  }
  clearAuthCookies(res: Response) {
    res.clearCookie(AUTH_COOKIE_NAMES.accessToken, this.getCookieOptions());
    res.clearCookie(AUTH_COOKIE_NAMES.refreshToken, this.getCookieOptions());
  }
  private async createAuthTokens(user: User) {
    const refreshJti = createTokenJti();
    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        secret: this.getRequiredEnv('JWT_ACCESS_SECRET'),
        expiresIn: this.getJwtExpiresIn('ACCESS_TOKEN_TTL', '15m'),
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role, jti: refreshJti },
      {
        secret: this.getRequiredEnv('JWT_REFRESH_SECRET'),
        expiresIn: this.getJwtExpiresIn('REFRESH_TOKEN_TTL', '30d'),
      },
    );
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        jti: refreshJti,
        tokenHash: await hashToken(refreshToken),
        expiresAt: calculateRefreshTokenExpiresAt(
          Number(
            this.configService.get<string>('REFRESH_TOKEN_TTL_DAYS') ?? 30,
          ),
        ),
      },
    });
    return { accessToken, refreshToken };
  }
  private getCookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
  private toPublicUser(user: User) {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
  private getRequiredEnv(key: string) {
    const value = this.configService.get<string>(key);
    if (!value) throw new Error(`${key} is not set`);
    return value;
  }
  private getJwtExpiresIn(
    key: string,
    defaultValue: NonNullable<JwtSignOptions['expiresIn']>,
  ): JwtSignOptions['expiresIn'] {
    return (this.configService.get<string>(key) ??
      defaultValue) as JwtSignOptions['expiresIn'];
  }
}
