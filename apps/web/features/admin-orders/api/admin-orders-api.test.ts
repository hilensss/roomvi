import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/shared/api/api-client', () => ({ apiFetch }));

import {
  getAdminOrder,
  listAdminOrders,
  updateAdminOrderItemComment,
  updateAdminOrderItemProcurementStatus,
  updateAdminOrderManagerComment,
  updateAdminOrderStatus,
} from './admin-orders-api';

describe('admin orders api', () => {
  beforeEach(() => apiFetch.mockReset());

  it('loads list/detail and sends status updates to exact endpoints', async () => {
    const params = new URLSearchParams('limit=20&offset=0&status=CONFIRMED');
    await listAdminOrders(params);
    await getAdminOrder('order-1');
    await updateAdminOrderStatus('order-1', 'PROCESSING');
    await updateAdminOrderItemProcurementStatus(
      'order-1',
      'item-1',
      'ORDERED',
    );

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/admin/orders?limit=20&offset=0&status=CONFIRMED',
    );
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/admin/orders/order-1');
    expect(apiFetch).toHaveBeenNthCalledWith(3, '/admin/orders/order-1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'PROCESSING' }),
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      '/admin/orders/order-1/items/item-1/procurement-status',
      {
        method: 'PATCH',
        body: JSON.stringify({ procurementStatus: 'ORDERED' }),
      },
    );
  });

  it('sends nullable order and item manager comments', async () => {
    await updateAdminOrderManagerComment('order-1', null);
    await updateAdminOrderItemComment('order-1', 'item-1', 'Проверить цвет');

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/admin/orders/order-1/manager-comment',
      { method: 'PATCH', body: JSON.stringify({ managerComment: null }) },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      '/admin/orders/order-1/items/item-1/manager-comment',
      {
        method: 'PATCH',
        body: JSON.stringify({ managerComment: 'Проверить цвет' }),
      },
    );
  });
});
