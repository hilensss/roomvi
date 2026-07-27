import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { JwtUser } from '../auth/types/jwt-user.type.js';
import { B2BProjectsService } from './b2b-projects.service.js';
import { B2BProjectCatalogQueryDto } from './dto/b2b-project-catalog-query.dto.js';
import { ConfirmB2BRoomsDto } from './dto/confirm-b2b-rooms.dto.js';
import { CreateB2BProjectDto } from './dto/create-b2b-project.dto.js';
import { ListB2BProjectsQueryDto } from './dto/list-b2b-projects-query.dto.js';
import { ReplaceB2BProjectProductsDto } from './dto/replace-b2b-project-products.dto.js';
import { ReplaceB2BRoomsDto } from './dto/replace-b2b-rooms.dto.js';
import { UpdateB2BProjectDto } from './dto/update-b2b-project.dto.js';
import { ManagerGuard } from './guards/manager.guard.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ALLOWED_ROOM_IMAGE_MIME_TYPES,
  ROOM_IMAGE_MAX_SIZE_BYTES,
  ROOM_IMAGE_UPLOAD_FIELD,
} from '../files/constants/upload.constants.js';

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

  @Post('floor-plans/upload')
  @UseInterceptors(
    FileInterceptor(ROOM_IMAGE_UPLOAD_FIELD, {
      storage: memoryStorage(),
      limits: { fileSize: ROOM_IMAGE_MAX_SIZE_BYTES },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_ROOM_IMAGE_MIME_TYPES.includes(file.mimetype as never)) {
          return callback(
            new BadRequestException(
              'Only JPEG, PNG and WEBP images are allowed',
            ) as never,
            false,
          );
        }
        return callback(null, true);
      },
    }),
  )
  uploadFloorPlan(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: Request,
  ) {
    if (!file) throw new BadRequestException('File is required');
    const user = request.user as JwtUser;
    return this.b2bProjectsService.uploadFloorPlan(file, user.userId);
  }

  @Post(':id/analyze-floor-plan')
  analyzeFloorPlan(@Param('id') id: string) {
    return this.b2bProjectsService.startFloorPlanAnalysis(id);
  }

  @Get(':id/analysis')
  getLatestAnalysis(@Param('id') id: string) {
    return this.b2bProjectsService.getLatestAnalysis(id);
  }

  @Get(':id/floor-plan')
  async getFloorPlan(@Param('id') id: string) {
    const file = await this.b2bProjectsService.downloadFloorPlan(id);
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename="${file.fileName}"`,
      length: file.contentLength,
    });
  }

  @Put(':id/rooms')
  replaceRooms(
    @Param('id') id: string,
    @Body() dto: ReplaceB2BRoomsDto,
  ) {
    return this.b2bProjectsService.replaceRooms(id, dto);
  }

  @Post(':id/rooms/confirm')
  confirmRooms(
    @Param('id') id: string,
    @Body() dto: ConfirmB2BRoomsDto,
  ) {
    return this.b2bProjectsService.confirmRooms(id, dto);
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

  @Get(':id/variants/:variantId/download')
  async downloadVariant(
    @Param('id') id: string,
    @Param('variantId') variantId: string,
  ) {
    const file = await this.b2bProjectsService.downloadVariant(id, variantId);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
      ...(file.contentLength === undefined
        ? {}
        : { length: file.contentLength }),
    });
  }
}
