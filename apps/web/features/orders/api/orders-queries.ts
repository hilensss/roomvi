'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { CreateOrderInput } from '../model/order.types';
import { cancelOrder, createOrder, getOrder, listOrders } from './orders-api';

export const orderQueryKeys = {
  all: ['orders'] as const,
  lists: () => ['orders', 'list'] as const,
  list: (limit: number) => ['orders', 'list', { limit }] as const,
  details: () => ['orders', 'detail'] as const,
  detail: (orderId: string) => ['orders', 'detail', orderId] as const,
};

export function useOrdersInfiniteQuery(limit = 20) {
  return useInfiniteQuery({
    queryKey: orderQueryKeys.list(limit),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => listOrders({ limit, offset: pageParam }),
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
  });
}

export function useOrderQuery(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: orderQueryKeys.detail(orderId ?? ''),
    queryFn: () => getOrder(orderId as string),
    enabled: enabled && Boolean(orderId),
  });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      input: CreateOrderInput;
      idempotencyKey: string;
    }) => createOrder(input, idempotencyKey),
    onSuccess: async (order) => {
      queryClient.setQueryData(orderQueryKeys.detail(order.id), order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['cart'] }),
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ['profile', 'summary'] }),
      ]);
    },
  });
}

export function useCancelOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: cancelOrder,
    onError: async (error, orderId) => {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : null;
      if (status !== 409) return;

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orderQueryKeys.detail(orderId),
        }),
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ['profile', 'summary'] }),
      ]);
    },
    onSuccess: async (order) => {
      queryClient.setQueryData(orderQueryKeys.detail(order.id), order);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orderQueryKeys.lists() }),
        queryClient.invalidateQueries({ queryKey: ['profile', 'summary'] }),
      ]);
    },
  });
}
