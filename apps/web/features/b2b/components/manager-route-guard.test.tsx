import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  user: { id: 'user-1', role: 'USER' } as {
    id: string;
    role: 'USER' | 'MANAGER' | 'ADMIN';
  } | null,
}));

vi.mock('@/features/auth/api/auth-queries', () => ({
  useCurrentUserQuery: () => ({
    data: mocks.user,
    isLoading: false,
    isError: false,
  }),
}));

import { ManagerRouteGuard } from './manager-route-guard';

describe('ManagerRouteGuard', () => {
  beforeEach(() => {
    mocks.user = { id: 'user-1', role: 'USER' };
  });

  it('refuses a regular user', () => {
    renderWithQueryClient(
      <ManagerRouteGuard>
        <div>Рабочее пространство</div>
      </ManagerRouteGuard>,
    );

    expect(screen.getByText('Доступ запрещён')).toBeInTheDocument();
    expect(screen.queryByText('Рабочее пространство')).not.toBeInTheDocument();
  });

  it.each(['MANAGER', 'ADMIN'] as const)(
    'renders content for %s',
    (role) => {
      mocks.user = { id: `${role.toLowerCase()}-1`, role };
      renderWithQueryClient(
        <ManagerRouteGuard>
          <div>Рабочее пространство</div>
        </ManagerRouteGuard>,
      );

      expect(screen.getByText('Рабочее пространство')).toBeInTheDocument();
    },
  );
});
