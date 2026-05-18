import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { CatalogSyncService } from './catalog-sync.service.js';
import { MockSupplierAdapter } from './suppliers/mock-supplier.adapter.js';
@Module({
  controllers: [CatalogController],
  providers: [CatalogService, CatalogSyncService, MockSupplierAdapter],
  exports: [CatalogService],
})
export class CatalogModule {}
