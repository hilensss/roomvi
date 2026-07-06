'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogFiltersState } from '../model/catalog.types';
import {
  addCatalogProductToCart,
  getCatalogProduct,
  getCatalogProducts,
} from './catalog-api';

export const catalogQueryKeys = {
  products: (filters: CatalogFiltersState) =>
    ['catalog', 'products', filters] as const,
  product: (productId: string) => ['catalog', 'product', productId] as const,
};

export function useCatalogProductsQuery(filters: CatalogFiltersState) {
  return useQuery({
    queryKey: catalogQueryKeys.products(filters),
    queryFn: () => getCatalogProducts(filters),
  });
}

export function useCatalogProductQuery(productId: string) {
  return useQuery({
    queryKey: catalogQueryKeys.product(productId),
    queryFn: () => getCatalogProduct(productId),
    enabled: Boolean(productId),
  });
}

export function useAddCatalogProductToCartMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      productId,
      quantity = 1,
    }: {
      productId: string;
      quantity?: number;
    }) => addCatalogProductToCart(productId, quantity),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['cart'],
      });
    },
  });
}
