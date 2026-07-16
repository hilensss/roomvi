import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams('limit=20&offset=0'),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/orders',
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => mocks.params,
}));
vi.mock('../api/admin-orders-queries', () => ({
  useAdminOrdersQuery: () => ({
    data: {
      items: [
        {
          id: 'order-1',
          number: 1042,
          customerName: 'Анна Иванова',
          customerEmail: 'anna@example.com',
          customerPhone: '+79991234567',
          status: 'CONFIRMED',
          paymentStatus: 'PENDING',
          fulfillmentStatus: 'NOT_STARTED',
          totalAmount: 24000,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    },
    isLoading: false,
    isError: false,
  }),
}));

import { AdminOrdersPage } from './admin-orders-page';

beforeEach(() => vi.clearAllMocks());

it('renders order rows and stores status filters in the URL', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<AdminOrdersPage />);

  expect(screen.getAllByRole('link', { name: /Заказ №1042/ })[0]).toHaveAttribute(
    'href',
    '/admin/orders/order-1',
  );
  await user.selectOptions(screen.getByLabelText('Статус заказа'), 'PROCESSING');

  const nextUrl = mocks.replace.mock.calls[0][0] as string;
  expect(nextUrl).toContain('/admin/orders?');
  expect(nextUrl).toContain('status=PROCESSING');
  expect(nextUrl).toContain('offset=0');
});
