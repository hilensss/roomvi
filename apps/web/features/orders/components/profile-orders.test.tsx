import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  detailEnabled: [] as boolean[],
  cancel: vi.fn(),
}));

const summary = {
  id: 'order-1',
  number: 1042,
  status: 'PENDING_PAYMENT',
  paymentStatus: 'PENDING',
  fulfillmentStatus: 'NOT_STARTED',
  subtotalAmount: 24000,
  deliveryAmount: 0,
  totalAmount: 24000,
  currency: 'RUB',
  paidAt: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  items: [],
  itemCount: 2,
  payment: {
    id: 'payment-1',
    provider: 'MANUAL',
    status: 'PENDING',
    amount: 24000,
    currency: 'RUB',
    paymentUrl: null,
    paidAt: null,
  },
};

const detail = {
  ...summary,
  cartId: 'cart-1',
  customerName: 'Анна Иванова',
  customerEmail: 'anna@example.com',
  customerPhone: '+79991234567',
  deliveryCity: 'Москва',
  deliveryAddress: 'Тверская, 10',
  deliveryPostalCode: null,
  deliveryComment: null,
  customerComment: 'Позвонить заранее',
  items: [
    {
      id: 'item-1',
      productId: 'product-1',
      supplierId: 'supplier-1',
      source: 'CATALOG',
      roomProjectId: null,
      designVariantId: null,
      quantity: 2,
      priceSnapshot: 12000,
      totalPrice: 24000,
      titleSnapshot: 'Кресло Луна',
      imageSnapshot: null,
      availabilitySnapshot: 'IN_STOCK',
      procurementStatus: 'NOT_STARTED',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

vi.mock('../api/orders-queries', () => ({
  useOrdersInfiniteQuery: () => ({
    data: { pages: [{ items: [summary], total: 1, limit: 20, offset: 0 }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useOrderQuery: (_id: string, enabled: boolean) => {
    mocks.detailEnabled.push(enabled);
    return { data: enabled ? detail : undefined, isLoading: false, isError: false };
  },
  useCancelOrderMutation: () => ({
    mutateAsync: mocks.cancel,
    isPending: false,
  }),
}));

import { ProfileOrders } from './profile-orders';

describe('ProfileOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detailEnabled.length = 0;
    mocks.cancel.mockResolvedValue(detail);
  });

  it('loads detail only after expanding and shows manual payment copy', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileOrders />);

    expect(screen.queryByText('Кресло Луна')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Заказ №1042/ }));

    expect(await screen.findByText('Кресло Луна')).toBeInTheDocument();
    expect(
      screen.getByText(/менеджер свяжется с вами для подтверждения/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Оплата' })).toBeInTheDocument();
    expect(screen.getByText('Через менеджера')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /оплатить/i })).not.toBeInTheDocument();
    expect(mocks.detailEnabled).toContain(true);
  });

  it('confirms a permitted cancellation', async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<ProfileOrders initialOrderId="order-1" />);

    await user.click(await screen.findByRole('button', { name: 'Отменить заказ' }));
    await user.click(screen.getByRole('button', { name: 'Да, отменить' }));

    expect(mocks.cancel).toHaveBeenCalledWith('order-1');
  });
});
