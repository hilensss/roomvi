import { extname } from 'path';
import { randomUUID } from 'crypto';

export function createSafeFileName(originalName: string): string {
  const extension = extname(originalName).toLowerCase();

  return `${randomUUID()}${extension}`;
}
