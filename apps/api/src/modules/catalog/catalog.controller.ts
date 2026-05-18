import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { CatalogProductsQueryDto } from './dto/catalog-products-query.dto.js';
import { SyncMockSupplierDto } from './dto/sync-mock-supplier.dto.js';
import { CatalogService } from './catalog.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly catalogSyncService: CatalogSyncService,
  ) {}
  @Public() @Get('products') async getProducts(
    @Query() query: CatalogProductsQueryDto,
  ) {
    return this.catalogService.findProducts(query);
  }
  @Public() @Get('products/:id') async getProductById(@Param('id') id: string) {
    return this.catalogService.findProductById(id);
  }
  @Public() @Post('sync/mock') async syncMockSupplier(
    @Body() _dto: SyncMockSupplierDto,
  ) {
    return this.catalogSyncService.syncMockSupplier();
  }
}
