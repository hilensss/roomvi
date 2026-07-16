import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/features/auth/api/auth-queries', () => ({
  useCurrentUserQuery: () => ({ data: { id: 'user-1' } }),
}));
vi.mock('../api/cart-queries', () => ({
  useCurrentCartQuery: () => ({
    data: {
      id: 'cart-1',
      items: [
        {
          id: 'item-1',
          quantity: 1,
          priceSnapshot: 12000,
          roomProjectId: null,
          titleSnapshot: 'Кресло',
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('./cart-summary-card', () => ({
  CartSummaryCard: ({ onCheckout }: { onCheckout: () => void }) => (
    <button onClick={onCheckout}>Оформить заказ</button>
  ),
}));
vi.mock('./cart-group-card', () => ({ CartGroupCard: () => null }));
vi.mock('./cart-benefits-card', () => ({ CartBenefitsCard: () => null }));
vi.mock('@/features/auth/components/auth-required-modal', () => ({
  AuthRequiredModal: () => null,
}));

import { CartPage } from './cart-page';

it('opens the dedicated checkout page for an authenticated user', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<CartPage />);

  await user.click(screen.getByRole('button', { name: 'Оформить заказ' }));

  expect(mocks.push).toHaveBeenCalledWith('/checkout');
});
