import { ConflictException, Injectable } from '@nestjs/common';
import { UserRole } from '@roomvi/database';
import { PrismaService } from '../prisma/prisma.service.js';
type CreateUserInput = {
  email: string;
  passwordHash: string;
  name?: string;
  phone?: string;
  role?: UserRole;
};
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: CreateUserInput) {
    const email = input.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing)
      throw new ConflictException('User with this email already exists');

    try {
      return await this.prisma.user.create({
        data: {
          email,
          passwordHash: input.passwordHash,
          name: input.name,
          phone: input.phone,
          role: input.role ?? UserRole.USER,
        },
      });
    } catch (error: unknown) {
      if (hasPrismaErrorCode(error, 'P2002')) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }
  }
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
  }
  async findPublicById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }
}

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
