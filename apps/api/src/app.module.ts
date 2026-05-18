import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { GenerationModule } from './modules/generation/generation.module.js';
import { GenerationQueueModule } from './modules/generation-queue/generation-queue.module.js';
import { GuestModule } from './modules/guest/guest.module.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { UsersModule } from './modules/users/users.module.js';

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
  ],
})
export class AppModule {}
