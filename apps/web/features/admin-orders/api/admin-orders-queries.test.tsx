import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestQueryClient } from '@/test/render';

const api = vi.hoisted(() => ({
  getAdminOrder: vi.fn(),
  listAdminOrders: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
  updateAdminOrderManagerComment: vi.fn(),
  updateAdminOrderItemProcurementStatus: vi.fn(),
  updateAdminOrderItemComment: vi.fn(),
}));
vi.mock('./admin-orders-api', () => api);

import {
  adminOrderQueryKeys,
  useUpdateAdminItemCommentMutation,
  useUpdateAdminItemProcurementMutation,
} from './admin-orders-queries';

describe('admin order mutations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates detail cache and invalidates lists after procurement update', async () => {
    const updated = { id: 'order-1', fulfillmentStatus: 'PROCUREMENT' };
    api.updateAdminOrderItemProcurementStatus.mockResolvedValue(updated);
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useUpdateAdminItemProcurementMutation(),
      { wrapper },
    );

    await act(() =>
      result.current.mutateAsync({
        orderId: 'order-1',
        itemId: 'item-1',
        procurementStatus: 'ORDERED',
      }),
    );

    expect(queryClient.getQueryData(adminOrderQueryKeys.detail('order-1'))).toBe(
      updated,
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminOrderQueryKeys.lists(),
    });
  });

  it('normalizes a blank item comment to null', async () => {
    api.updateAdminOrderItemComment.mockResolvedValue({ id: 'order-1' });
    const queryClient = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateAdminItemCommentMutation(), {
      wrapper,
    });

    await act(() =>
      result.current.mutateAsync({
        orderId: 'order-1',
        itemId: 'item-1',
        managerComment: '   ',
      }),
    );

    expect(api.updateAdminOrderItemComment).toHaveBeenCalledWith(
      'order-1',
      'item-1',
      null,
    );
  });

  it('refreshes admin detail and list after a concurrent mutation conflict', async () => {
    api.updateAdminOrderItemProcurementStatus.mockRejectedValue(
      Object.assign(new Error('Conflict'), { status: 409 }),
    );
    const queryClient = createTestQueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useUpdateAdminItemProcurementMutation(),
      { wrapper },
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          orderId: 'order-1',
          itemId: 'item-1',
          procurementStatus: 'ORDERED',
        }),
      ).rejects.toMatchObject({ status: 409 });
    });

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminOrderQueryKeys.detail('order-1'),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: adminOrderQueryKeys.lists(),
    });
  });
});
