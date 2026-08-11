import { apiFetch } from '@/shared/api/api-client';
import type { AuthUser } from '@/shared/api/types';

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  email: string;
  password: string;
  name?: string;
  phone?: string;
};

export type AuthResponse = {
  user: AuthUser;
};

export async function getCurrentUser() {
  const response = await apiFetch<AuthResponse>('/auth/me');
  return response.user;
}

export function login(input: LoginInput) {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function register(input: RegisterInput) {
  return apiFetch<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function logout() {
  return apiFetch<void>('/auth/logout', {
    method: 'POST',
  });
}
