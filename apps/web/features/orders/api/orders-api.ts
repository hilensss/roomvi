import { apiFetch } from '@/shared/api/api-client';
import type {
  CreateOrderInput,
  OrderDetail,
  OrdersListResponse,
} from '../model/order.types';

export function createOrder(input: CreateOrderInput, idempotencyKey: string) {
  return apiFetch<OrderDetail>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function listOrders({ limit, offset }: { limit: number; offset: number }) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  return apiFetch<OrdersListResponse>(`/orders?${params.toString()}`);
}

export function getOrder(orderId: string) {
  return apiFetch<OrderDetail>(`/orders/${orderId}`);
}

export function cancelOrder(orderId: string) {
  return apiFetch<OrderDetail>(`/orders/${orderId}/cancel`, {
    method: 'POST',
  });
}
