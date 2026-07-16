import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  mutateAsync: vi.fn(),
  currentUser: {
    data: {
      id: 'user-1',
      name: 'Анна Иванова',
      email: 'anna@example.com',
      phone: '+79991234567',
      role: 'USER',
    },
    isLoading: false,
  },
  cart: {
    data: {
      id: 'cart-1',
      items: [
        {
          id: 'item-1',
          quantity: 2,
          priceSnapshot: 12000,
          titleSnapshot: 'Кресло Луна',
          imageSnapshot: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/features/auth/api/auth-queries', () => ({
  useCurrentUserQuery: () => mocks.currentUser,
}));
vi.mock('@/features/cart/api/cart-queries', () => ({
  useCurrentCartQuery: () => mocks.cart,
}));
vi.mock('../api/orders-queries', () => ({
  useCreateOrderMutation: () => ({
    mutateAsync: mocks.mutateAsync,
    isPending: false,
  }),
}));

import { CheckoutPage } from './checkout-page';

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cart.refetch.mockResolvedValue({ data: mocks.cart.data });
  });

  it('submits sanitized server-safe data and redirects to the created order', async () => {
    mocks.mutateAsync.mockResolvedValue({ id: 'order-1' });
    const user = userEvent.setup();
    renderWithQueryClient(<CheckoutPage />);

    expect(screen.getByLabelText('Имя и фамилия')).toHaveValue('Анна Иванова');
    expect(screen.getByLabelText('Email')).toHaveValue('anna@example.com');
    expect(screen.getByLabelText('Телефон')).toHaveValue('+79991234567');

    await user.type(screen.getByLabelText('Город'), '  Москва  ');
    await user.type(screen.getByLabelText('Адрес доставки'), '  Тверская, 10  ');
    await user.click(screen.getByRole('button', { name: 'Оформить заказ' }));

    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      input: {
        customerName: 'Анна Иванова',
        customerEmail: 'anna@example.com',
        customerPhone: '+79991234567',
        deliveryCity: 'Москва',
        deliveryAddress: 'Тверская, 10',
      },
      idempotencyKey: expect.any(String),
    });
    expect(mocks.replace).toHaveBeenCalledWith(
      '/account?order=order-1&created=1',
    );
  });

  it('keeps the idempotency key and form values after a network failure', async () => {
    mocks.mutateAsync
      .mockRejectedValueOnce(new Error('Сеть недоступна'))
      .mockResolvedValueOnce({ id: 'order-1' });
    const user = userEvent.setup();
    renderWithQueryClient(<CheckoutPage />);

    await user.type(screen.getByLabelText('Город'), 'Москва');
    await user.type(screen.getByLabelText('Адрес доставки'), 'Тверская, 10');
    await user.click(screen.getByRole('button', { name: 'Оформить заказ' }));
    expect(await screen.findByText('Сеть недоступна')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить оформление' }));

    const firstKey = mocks.mutateAsync.mock.calls[0][0].idempotencyKey;
    const retryKey = mocks.mutateAsync.mock.calls[1][0].idempotencyKey;
    expect(retryKey).toBe(firstKey);
    expect(screen.getByLabelText('Город')).toHaveValue('Москва');
  });

  it('refreshes the cart and keeps a safe way back after a checkout conflict', async () => {
    mocks.mutateAsync.mockRejectedValue(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );
    const user = userEvent.setup();
    renderWithQueryClient(<CheckoutPage />);

    await user.type(screen.getByLabelText('Город'), 'Москва');
    await user.type(screen.getByLabelText('Адрес доставки'), 'Тверская, 10');
    await user.click(screen.getByRole('button', { name: 'Оформить заказ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Корзина или заказ изменились',
    );
    expect(mocks.cart.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Проверить корзину' })).toHaveAttribute(
      'href',
      '/cart',
    );
  });
});
