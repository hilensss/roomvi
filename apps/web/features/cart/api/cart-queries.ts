'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getCurrentCart,
  refreshCart,
  removeCartItem,
  updateCartItem,
} from './cart-api';

export const cartQueryKeys = {
  current: ['cart', 'current'] as const,
};

export function useCurrentCartQuery() {
  return useQuery({
    queryKey: cartQueryKeys.current,
    queryFn: getCurrentCart,
  });
}

export function useUpdateCartItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItem(itemId, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: cartQueryKeys.current,
      });
    },
  });
}

export function useRemoveCartItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => removeCartItem(itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: cartQueryKeys.current,
      });
    },
  });
}

export function useRefreshCartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cartId: string) => refreshCart(cartId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: cartQueryKeys.current,
      });
    },
  });
}
