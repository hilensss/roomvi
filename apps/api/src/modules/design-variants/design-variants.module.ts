import { Module } from '@nestjs/common';
import { DesignVariantsService } from './design-variants.service.js';
import { DesignVariantsController } from './design-variants.controller.js';
import { GuestModule } from '../guest/guest.module.js';

@Module({
  imports: [GuestModule],
  controllers: [DesignVariantsController],
  providers: [DesignVariantsService],
  exports: [DesignVariantsService],
})
export class DesignVariantsModule {}
