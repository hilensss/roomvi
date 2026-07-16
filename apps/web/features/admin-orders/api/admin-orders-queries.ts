'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type {
  OrderItemProcurementStatus,
  OrderStatus,
} from '@/features/orders/model/order.types';
import type { AdminOrder } from '../model/admin-order.types';
import {
  getAdminOrder,
  listAdminOrders,
  updateAdminOrderItemComment,
  updateAdminOrderItemProcurementStatus,
  updateAdminOrderManagerComment,
  updateAdminOrderStatus,
} from './admin-orders-api';

export const adminOrderQueryKeys = {
  all: ['admin', 'orders'] as const,
  lists: () => ['admin', 'orders', 'list'] as const,
  list: (params: string) => ['admin', 'orders', 'list', params] as const,
  details: () => ['admin', 'orders', 'detail'] as const,
  detail: (orderId: string) => ['admin', 'orders', 'detail', orderId] as const,
};

export function useAdminOrdersQuery(params: URLSearchParams) {
  const serialized = params.toString();
  return useQuery({
    queryKey: adminOrderQueryKeys.list(serialized),
    queryFn: () => listAdminOrders(new URLSearchParams(serialized)),
  });
}

export function useAdminOrderQuery(orderId: string) {
  return useQuery({
    queryKey: adminOrderQueryKeys.detail(orderId),
    queryFn: () => getAdminOrder(orderId),
  });
}

async function storeAdminOrder(queryClient: QueryClient, order: AdminOrder) {
  queryClient.setQueryData(adminOrderQueryKeys.detail(order.id), order);
  await queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.lists() });
}

async function refreshAdminOrderAfterConflict(
  queryClient: QueryClient,
  error: unknown,
  orderId: string,
) {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : null;
  if (status !== 409) return;

  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: adminOrderQueryKeys.detail(orderId),
    }),
    queryClient.invalidateQueries({ queryKey: adminOrderQueryKeys.lists() }),
  ]);
}

export function useUpdateAdminOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: OrderStatus }) =>
      updateAdminOrderStatus(orderId, status),
    onError: (error, { orderId }) =>
      refreshAdminOrderAfterConflict(queryClient, error, orderId),
    onSuccess: (order) => storeAdminOrder(queryClient, order),
  });
}

export function useUpdateAdminOrderCommentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      managerComment,
    }: {
      orderId: string;
      managerComment: string;
    }) =>
      updateAdminOrderManagerComment(
        orderId,
        managerComment.trim() || null,
      ),
    onError: (error, { orderId }) =>
      refreshAdminOrderAfterConflict(queryClient, error, orderId),
    onSuccess: (order) => storeAdminOrder(queryClient, order),
  });
}

export function useUpdateAdminItemProcurementMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      itemId,
      procurementStatus,
    }: {
      orderId: string;
      itemId: string;
      procurementStatus: OrderItemProcurementStatus;
    }) =>
      updateAdminOrderItemProcurementStatus(
        orderId,
        itemId,
        procurementStatus,
      ),
    onError: (error, { orderId }) =>
      refreshAdminOrderAfterConflict(queryClient, error, orderId),
    onSuccess: (order) => storeAdminOrder(queryClient, order),
  });
}

export function useUpdateAdminItemCommentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      itemId,
      managerComment,
    }: {
      orderId: string;
      itemId: string;
      managerComment: string;
    }) =>
      updateAdminOrderItemComment(
        orderId,
        itemId,
        managerComment.trim() || null,
      ),
    onError: (error, { orderId }) =>
      refreshAdminOrderAfterConflict(queryClient, error, orderId),
    onSuccess: (order) => storeAdminOrder(queryClient, order),
  });
}
