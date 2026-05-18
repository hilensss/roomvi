import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AUTH_COOKIE_NAMES } from '../constants/auth-cookies.constants.js';
import { JwtPayload } from '../types/jwt-payload.type.js';
import { JwtUser } from '../types/jwt-user.type.js';
function extractAccessTokenFromCookie(req: Request): string | null {
  return req?.cookies?.[AUTH_COOKIE_NAMES.accessToken] ?? null;
}
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractAccessTokenFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }
  async validate(payload: JwtPayload): Promise<JwtUser> {
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
