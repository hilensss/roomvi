import { Prisma } from '@roomvi/database';
import type { PrismaService } from '../prisma/prisma.service.js';

const SERIALIZABLE_ATTEMPTS = 3;

export async function runSerializableTransaction<T>(
  prisma: Pick<PrismaService, '$transaction'>,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (
        !hasPrismaErrorCode(error, 'P2034') ||
        attempt === SERIALIZABLE_ATTEMPTS
      ) {
        throw error;
      }
    }
  }

  throw new Error('Serializable transaction retry limit exhausted');
}

function hasPrismaErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === code
  );
}
