import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from '@roomvi/database';
import type { JwtUser } from '../../auth/types/jwt-user.type.js';

export class ManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtUser | undefined;

    if (
      !user ||
      (user.role !== UserRole.MANAGER && user.role !== UserRole.ADMIN)
    ) {
      throw new ForbiddenException('Manager access required');
    }

    return true;
  }
}
