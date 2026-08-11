import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/shared/api/api-client', () => ({ apiFetch }));

import { getCurrentUser } from './auth-api';

describe('auth api', () => {
  beforeEach(() => apiFetch.mockReset());

  it('unwraps the user returned by GET /auth/me', async () => {
    const user = {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Админ',
      phone: '77777777777',
      role: 'ADMIN',
      createdAt: '2026-07-16T17:02:10.195Z',
      updatedAt: '2026-07-16T17:02:10.195Z',
    };
    apiFetch.mockResolvedValue({ user });

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(apiFetch).toHaveBeenCalledWith('/auth/me');
  });
});
