import * as bcrypt from 'bcrypt';
export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}
export async function comparePassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}
