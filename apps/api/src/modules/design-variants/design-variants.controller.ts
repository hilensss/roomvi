import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { DesignVariantsService } from './design-variants.service.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { GUEST_COOKIE_NAMES } from '../guest/constants/guest-cookies.constants.js';

@Controller('design-variants')
export class DesignVariantsController {
  constructor(private readonly designVariantsService: DesignVariantsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/select')
  selectDesignVariant(@Param('id') id: string, @Req() req: Request) {
    return this.designVariantsService.selectDesignVariant(id, {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  async getDesignVariantById(@Param('id') id: string, @Req() req: Request) {
    return this.designVariantsService.getDesignVariantById(id, {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }
}
