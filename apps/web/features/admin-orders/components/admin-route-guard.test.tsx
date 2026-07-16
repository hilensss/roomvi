import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1', role: 'USER' } as { id: string; role: 'USER' | 'ADMIN' } | null,
}));

vi.mock('@/features/auth/api/auth-queries', () => ({
  useCurrentUserQuery: () => ({
    data: mocks.user,
    isLoading: false,
    isError: false,
  }),
}));

import { AdminRouteGuard } from './admin-route-guard';

describe('AdminRouteGuard', () => {
  beforeEach(() => {
    mocks.user = { id: 'user-1', role: 'USER' };
  });

  it('refuses a regular user', () => {
    renderWithQueryClient(
      <AdminRouteGuard>
        <div>Секретная админка</div>
      </AdminRouteGuard>,
    );

    expect(screen.getByText('Доступ запрещён')).toBeInTheDocument();
    expect(screen.queryByText('Секретная админка')).not.toBeInTheDocument();
  });

  it('renders content for an admin', () => {
    mocks.user = { id: 'admin-1', role: 'ADMIN' };
    renderWithQueryClient(
      <AdminRouteGuard>
        <div>Секретная админка</div>
      </AdminRouteGuard>,
    );

    expect(screen.getByText('Секретная админка')).toBeInTheDocument();
  });
});
