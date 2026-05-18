import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
export function createTokenJti() {
  return randomUUID();
}
export async function hashToken(token: string) {
  return bcrypt.hash(token, 12);
}
export async function compareToken(token: string, tokenHash: string) {
  return bcrypt.compare(token, tokenHash);
}
export function calculateRefreshTokenExpiresAt(days = 30) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
