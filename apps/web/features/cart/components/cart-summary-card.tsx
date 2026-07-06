'use client';

import { ArrowRight, RefreshCw } from 'lucide-react';
import { formatMoney } from '../lib/cart.helpers';
import { useRefreshCartMutation } from '../api/cart-queries';

type CartSummaryCardProps = {
  cartId: string | null;
  itemsCount: number;
  totalAmount: number;
  deliveryPrice: number;
  finalAmount: number;
  onCheckout: () => void;
};

export function CartSummaryCard({
  cartId,
  itemsCount,
  totalAmount,
  deliveryPrice,
  finalAmount,
  onCheckout,
}: CartSummaryCardProps) {
  const refreshMutation = useRefreshCartMutation();

  return (
    <div className="relative overflow-hidden rounded-card bg-dark p-8 text-white">
      <div className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-pill bg-brand/30 blur-3xl" />

      <div className="relative">
        <div className="mb-6 text-xs uppercase tracking-[0.2em] text-brand">
          К оплате
        </div>

        <div className="mb-6 space-y-3 border-b border-white/10 pb-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-line">Товары · {itemsCount} шт.</span>
            <span className="font-medium">{formatMoney(totalAmount)}</span>
          </div>

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-line">Доставка</span>
            <span className="font-medium">
              {deliveryPrice === 0 ? 'Бесплатно' : formatMoney(deliveryPrice)}
            </span>
          </div>

          <div className="flex items-baseline justify-between text-sm">
            <span className="text-line">Сборка</span>
            <span className="text-line">по запросу</span>
          </div>
        </div>

        <div className="mb-6 flex items-baseline justify-between">
          <span className="text-sm text-line">Итого</span>
          <span className="text-[clamp(1.75rem,3vw,2.25rem)] font-semibold tracking-tight">
            {formatMoney(finalAmount)}
          </span>
        </div>

        <button
          type="button"
          onClick={onCheckout}
          className="flex w-full items-center justify-center gap-2 rounded-pill bg-brand px-6 py-4 font-medium text-white transition hover:bg-brand-hover"
        >
          Оформить заказ
          <ArrowRight size={16} />
        </button>

        <button
          type="button"
          disabled={!cartId || refreshMutation.isPending}
          onClick={() => {
            if (cartId) {
              refreshMutation.mutate(cartId);
            }
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-pill border border-white/20 px-6 py-3 text-sm text-line transition hover:bg-white/5 disabled:pointer-events-none disabled:opacity-50"
        >
          <RefreshCw
            size={15}
            className={refreshMutation.isPending ? 'animate-spin' : ''}
          />
          Обновить цены и наличие
        </button>

        {refreshMutation.isError ? (
          <div className="mt-4 rounded-md bg-white/10 px-4 py-3 text-sm text-line">
            {refreshMutation.error.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
