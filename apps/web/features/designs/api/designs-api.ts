import { apiFetch } from '@/shared/api/api-client';
import type { Cart, DesignVariant } from '@/shared/api/types';

export function getDesignVariant(designVariantId: string) {
  return apiFetch<DesignVariant>(`/design-variants/${designVariantId}`);
}

export function addDesignVariantToCart(designVariantId: string) {
  return apiFetch<Cart>(`/design-variants/${designVariantId}/add-to-cart`, {
    method: 'POST',
  });
}
