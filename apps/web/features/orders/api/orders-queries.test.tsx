import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';

const api = vi.hoisted(() => ({
  cancelOrder: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  listOrders: vi.fn(),
}));

vi.mock('./orders-api', () => api);

import {
  orderQueryKeys,
  useCancelOrderMutation,
  useCreateOrderMutation,
} from './orders-queries';

const updatedOrder = { id: 'order-1', number: 1042 };

describe('orders mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stores created detail and invalidates cart, lists, and profile', async () => {
    api.createOrder.mockResolvedValue(updatedOrder);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCreateOrderMutation(), { wrapper });

    await act(() =>
      result.current.mutateAsync({
        input: {
          customerName: 'Анна',
          customerEmail: 'anna@example.com',
          customerPhone: '+79991234567',
          deliveryCity: 'Москва',
          deliveryAddress: 'Тверская, 10',
        },
        idempotencyKey: 'attempt-key',
      }),
    );

    expect(queryClient.getQueryData(orderQueryKeys.detail('order-1'))).toBe(
      updatedOrder,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cart'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.lists() });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['profile', 'summary'],
    });
  });

  it('stores cancelled detail and refreshes order lists', async () => {
    api.cancelOrder.mockResolvedValue(updatedOrder);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCancelOrderMutation(), { wrapper });

    await act(() => result.current.mutateAsync('order-1'));

    expect(queryClient.getQueryData(orderQueryKeys.detail('order-1'))).toBe(
      updatedOrder,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.lists() });
  });

  it('refreshes the order detail after a cancellation conflict', async () => {
    api.cancelOrder.mockRejectedValue(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCancelOrderMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('order-1')).rejects.toMatchObject({
        status: 409,
      });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: orderQueryKeys.detail('order-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: orderQueryKeys.lists() });
  });
});
