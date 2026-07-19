import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { GenerationModule } from './modules/generation/generation.module.js';
import { GenerationQueueModule } from './modules/generation-queue/generation-queue.module.js';
import { GuestModule } from './modules/guest/guest.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { StorageModule } from './modules/storage/storage.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { DesignVariantsModule } from './modules/design-variants/design-variants.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { B2BProjectsModule } from './modules/b2b-projects/b2b-projects.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PrismaModule,
    UsersModule,
    GuestModule,
    AuthModule,
    CatalogModule,
    GenerationQueueModule,
    GenerationModule,
    StorageModule,
    FilesModule,
    DesignVariantsModule,
    CartModule,
    OrdersModule,
    AdminModule,
    ProfileModule,
    B2BProjectsModule,
  ],
})
export class AppModule {}
