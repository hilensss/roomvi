import { apiFetch } from '@/shared/api/api-client';
import type {
  OrderItemProcurementStatus,
  OrderStatus,
} from '@/features/orders/model/order.types';
import type {
  AdminOrder,
  AdminOrdersListResponse,
} from '../model/admin-order.types';

export function listAdminOrders(params: URLSearchParams) {
  return apiFetch<AdminOrdersListResponse>(
    `/admin/orders?${params.toString()}`,
  );
}

export function getAdminOrder(orderId: string) {
  return apiFetch<AdminOrder>(`/admin/orders/${orderId}`);
}

export function updateAdminOrderStatus(
  orderId: string,
  status: OrderStatus,
) {
  return apiFetch<AdminOrder>(`/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function updateAdminOrderManagerComment(
  orderId: string,
  managerComment: string | null,
) {
  return apiFetch<AdminOrder>(`/admin/orders/${orderId}/manager-comment`, {
    method: 'PATCH',
    body: JSON.stringify({ managerComment }),
  });
}

export function updateAdminOrderItemProcurementStatus(
  orderId: string,
  itemId: string,
  procurementStatus: OrderItemProcurementStatus,
) {
  return apiFetch<AdminOrder>(
    `/admin/orders/${orderId}/items/${itemId}/procurement-status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ procurementStatus }),
    },
  );
}

export function updateAdminOrderItemComment(
  orderId: string,
  itemId: string,
  managerComment: string | null,
) {
  return apiFetch<AdminOrder>(
    `/admin/orders/${orderId}/items/${itemId}/manager-comment`,
    {
      method: 'PATCH',
      body: JSON.stringify({ managerComment }),
    },
  );
}
