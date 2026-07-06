import { apiFetch } from '@/shared/api/api-client';
import type { Cart } from '@/shared/api/types';

export type EmptyCartResponse = {
  cart: null;
  items: [];
  totalAmount: 0;
  currency: 'RUB';
};

export type CurrentCartResponse = Cart | EmptyCartResponse;

export type UpdateCartItemInput = {
  quantity: number;
};

export type CartRefreshResponse = {
  cart: Cart;
  changes?: unknown[];
};

export function getCurrentCart() {
  return apiFetch<CurrentCartResponse>('/cart/current');
}

export function updateCartItem(itemId: string, input: UpdateCartItemInput) {
  return apiFetch<Cart>(`/cart/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeCartItem(itemId: string) {
  return apiFetch<Cart>(`/cart/items/${itemId}`, {
    method: 'DELETE',
  });
}

export function refreshCart(cartId: string) {
  return apiFetch<CartRefreshResponse>(`/cart/${cartId}/refresh`, {
    method: 'POST',
  });
}
