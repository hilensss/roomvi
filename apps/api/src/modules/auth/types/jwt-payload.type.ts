import { UserRole } from '@roomvi/database';
export type JwtPayload = {
  sub: string;
  email: string;
  role: UserRole;
  jti?: string;
};
