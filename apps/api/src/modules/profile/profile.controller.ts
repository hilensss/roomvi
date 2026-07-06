import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProfileService } from './profile.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('summary')
  @UseGuards(JwtAuthGuard)
  getProfileSummary(@CurrentUser() user: JwtUser) {
    return this.profileService.getSummary(user.userId);
  }
}
