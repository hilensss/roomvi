import { expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

vi.mock('@/features/auth/api/auth-queries', () => ({
  useCurrentUserQuery: () => ({ data: { id: 'admin-1', role: 'ADMIN' } }),
}));
vi.mock('@/features/auth/components/auth-modal', () => ({ AuthModal: () => null }));

import { Header } from './header';

it('shows the admin orders entry point to an ADMIN', () => {
  renderWithQueryClient(<Header />);
  expect(screen.getByRole('link', { name: 'Админка' })).toHaveAttribute(
    'href',
    '/admin/orders',
  );
});
