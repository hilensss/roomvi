import { createHash } from 'crypto';
export function hashGuestMeta(
  value: string | string[] | null | undefined,
  salt = '',
) {
  if (!value) return null;
  const normalized = Array.isArray(value) ? value.join(',') : value;
  if (!normalized.trim()) return null;
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
}
