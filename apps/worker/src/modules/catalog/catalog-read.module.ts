import { Module } from '@nestjs/common';
import { CatalogReadService } from './catalog-read.service.js';
@Module({ providers: [CatalogReadService], exports: [CatalogReadService] })
export class CatalogReadModule {}
