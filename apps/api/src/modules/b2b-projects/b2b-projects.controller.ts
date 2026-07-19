import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { B2BProjectsService } from './b2b-projects.service.js';
import { B2BProjectCatalogQueryDto } from './dto/b2b-project-catalog-query.dto.js';
import { CreateB2BProjectDto } from './dto/create-b2b-project.dto.js';
import { ListB2BProjectsQueryDto } from './dto/list-b2b-projects-query.dto.js';
import { ReplaceB2BProjectProductsDto } from './dto/replace-b2b-project-products.dto.js';
import { UpdateB2BProjectDto } from './dto/update-b2b-project.dto.js';
import { ManagerGuard } from './guards/manager.guard.js';

@Controller('manager/b2b-projects')
@UseGuards(JwtAuthGuard, ManagerGuard)
export class B2BProjectsController {
  constructor(private readonly b2bProjectsService: B2BProjectsService) {}

  @Get()
  list(@Query() query: ListB2BProjectsQueryDto) {
    return this.b2bProjectsService.list(query);
  }

  @Get('suppliers')
  listSuppliers() {
    return this.b2bProjectsService.listSuppliers();
  }

  @Post()
  create(@Body() dto: CreateB2BProjectDto, @Req() request: Request) {
    const user = request.user as JwtUser;
    return this.b2bProjectsService.create(dto, user.userId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.b2bProjectsService.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateB2BProjectDto) {
    return this.b2bProjectsService.update(id, dto);
  }

  @Get(':id/catalog')
  getCatalog(
    @Param('id') id: string,
    @Query() query: B2BProjectCatalogQueryDto,
  ) {
    return this.b2bProjectsService.getCatalog(id, query);
  }

  @Put(':id/products')
  replaceProducts(
    @Param('id') id: string,
    @Body() dto: ReplaceB2BProjectProductsDto,
  ) {
    return this.b2bProjectsService.replaceProducts(id, dto.productIds);
  }

  @Post(':id/generate')
  startGeneration(@Param('id') id: string, @Req() request: Request) {
    const user = request.user as JwtUser;
    return this.b2bProjectsService.startGeneration(id, user.userId);
  }
}
