import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { GuestService } from '../guest/guest.service.js';
import { GUEST_COOKIE_NAMES } from '../guest/constants/guest-cookies.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AUTH_COOKIE_NAMES } from './constants/auth-cookies.constants.js';
import { JwtUser } from './types/jwt-user.type.js';
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly guestService: GuestService,
  ) {}
  @Public() @Post('register') async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    await this.guestService.attachGuestSessionToUser(
      req.cookies?.[GUEST_COOKIE_NAMES.guestId],
      result.user.id,
    );
    this.guestService.clearGuestCookie(res);
    this.authService.setAuthCookies(res, result.tokens);
    return { user: result.user };
  }
  @Public() @Post('login') async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    await this.guestService.attachGuestSessionToUser(
      req.cookies?.[GUEST_COOKIE_NAMES.guestId],
      result.user.id,
    );
    this.guestService.clearGuestCookie(res);
    this.authService.setAuthCookies(res, result.tokens);
    return { user: result.user };
  }
  @Public() @Post('refresh') async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.refreshByToken(
      req.cookies?.[AUTH_COOKIE_NAMES.refreshToken],
    );
    this.authService.setAuthCookies(res, result.tokens);
    return { user: result.user };
  }
  @Post('logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutByToken(
      req.cookies?.[AUTH_COOKIE_NAMES.refreshToken],
    );
    this.authService.clearAuthCookies(res);
    return { success: true };
  }
  @Get('me') async me(@CurrentUser() user: JwtUser) {
    return { user: await this.authService.getMe(user.userId) };
  }
}
