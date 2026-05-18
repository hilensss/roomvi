import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { GuestService } from './guest.service.js';
@Controller('guest')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}
  @Public() @Get('session') async getSession(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.guestService.getOrCreateSession(req, res);
  }
}
