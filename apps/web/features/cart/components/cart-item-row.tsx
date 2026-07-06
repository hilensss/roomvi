'use client';

import Link from 'next/link';
import { Minus, Plus, X } from 'lucide-react';
import { SafeImage } from '@/shared/ui/safe-image';
import type { CartItem } from '@/shared/api/types';
import {
  formatMoney,
  getItemOldPrice,
  getProductImage,
  getProductSubtitle,
} from '../lib/cart.helpers';
import {
  useRemoveCartItemMutation,
  useUpdateCartItemMutation,
} from '../api/cart-queries';

type CartItemRowProps = {
  item: CartItem;
};

export function CartItemRow({ item }: CartItemRowProps) {
  const updateMutation = useUpdateCartItemMutation();
  const removeMutation = useRemoveCartItemMutation();

  const imageUrl = getProductImage(item);
  const oldPrice = getItemOldPrice(item);
  const itemTotal = item.priceSnapshot * item.quantity;

  const isPending = updateMutation.isPending || removeMutation.isPending;

  const updateQuantity = (quantity: number) => {
    if (quantity <= 0) {
      removeMutation.mutate(item.id);
      return;
    }

    updateMutation.mutate({
      itemId: item.id,
      quantity,
    });
  };

  return (
    <div className="flex gap-5 p-5">
      <Link
        href={`/catalog/${item.productId}`}
        className="relative size-24 shrink-0 overflow-hidden rounded-md bg-line/20 sm:size-28"
      >
        {imageUrl ? (
          <SafeImage
            src={imageUrl}
            alt={item.titleSnapshot}
            fill
            className="object-cover"
            sizes="112px"
          />
        ) : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-ink-soft">
              {item.product?.supplierId ? 'Поставщик' : 'Roomvi'}
            </div>

            <Link href={`/catalog/${item.productId}`} className="block">
              <h3 className="truncate text-lg font-medium tracking-tight text-ink transition-colors hover:text-brand">
                {item.titleSnapshot}
              </h3>
            </Link>

            <div className="mt-1 text-sm text-ink-soft">
              {getProductSubtitle(item)}
            </div>
          </div>

          <button
            type="button"
            onClick={() => removeMutation.mutate(item.id)}
            disabled={isPending}
            aria-label="Удалить"
            className="flex size-8 shrink-0 items-center justify-center rounded-pill text-ink-soft transition-colors hover:bg-line/20 hover:text-brand disabled:pointer-events-none disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-4 pt-4">
          <div className="inline-flex items-center rounded-pill border border-line/60">
            <button
              type="button"
              onClick={() => updateQuantity(item.quantity - 1)}
              disabled={isPending}
              aria-label="Меньше"
              className="flex size-9 items-center justify-center text-ink-soft transition hover:text-brand disabled:pointer-events-none disabled:opacity-50"
            >
              <Minus size={14} />
            </button>

            <span className="w-8 text-center text-sm font-medium text-ink">
              {item.quantity}
            </span>

            <button
              type="button"
              onClick={() => updateQuantity(item.quantity + 1)}
              disabled={isPending}
              aria-label="Больше"
              className="flex size-9 items-center justify-center text-ink-soft transition hover:text-brand disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="text-right">
            {oldPrice ? (
              <div className="text-xs text-line line-through">
                {formatMoney(oldPrice)}
              </div>
            ) : null}

            <div className="text-lg font-semibold text-ink">
              {formatMoney(itemTotal)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
