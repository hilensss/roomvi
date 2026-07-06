import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import { JwtUser } from '../auth/types/jwt-user.type.js';
import { GUEST_COOKIE_NAMES } from '../guest/constants/guest-cookies.constants.js';
import { CreateGenerationDto } from './dto/create-generation.dto.js';
import { GenerationApiService } from './generation-api.service.js';

@Controller('generations')
export class GenerationController {
  constructor(private readonly generationApiService: GenerationApiService) {}
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  async createGeneration(
    @Body() dto: CreateGenerationDto,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.generationApiService.createGeneration(dto, {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }

  @UseGuards(OptionalJwtAuthGuard) @Get('jobs/:id') async getJob(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.generationApiService.getGenerationJob(id, {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('projects')
  async listProjects(@Req() req: Request): Promise<unknown> {
    return this.generationApiService.listMyProjects({
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }

  @UseGuards(OptionalJwtAuthGuard) @Get('projects/:id') async getProject(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<unknown> {
    return this.generationApiService.getProject(id, {
      user: req.user as JwtUser | undefined,
      guestAnonymousId: req.cookies?.[GUEST_COOKIE_NAMES.guestId],
    });
  }
}
