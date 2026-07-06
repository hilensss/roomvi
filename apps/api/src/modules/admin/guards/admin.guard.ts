import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { JwtUser } from '../../auth/types/jwt-user.type.js';
import { UserRole } from '@roomvi/database';

export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUser | undefined;

    if (!user) throw new ForbiddenException('Admin access required');

    if (user.role !== UserRole.ADMIN)
      throw new ForbiddenException('Admin access required');

    return true;
  }
}
