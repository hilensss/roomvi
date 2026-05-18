import { UserRole } from '@roomvi/database';
export type JwtUser = { userId: string; email: string; role: UserRole };
