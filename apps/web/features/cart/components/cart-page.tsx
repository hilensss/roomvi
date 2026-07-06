'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ShoppingBag, Sparkles } from 'lucide-react';
import { AuthRequiredModal } from '@/features/auth/components/auth-required-modal';
import { useCurrentUserQuery } from '@/features/auth/api/auth-queries';
import { useCurrentCartQuery } from '../api/cart-queries';
import {
  formatMoney,
  getCartGroups,
  getCartItemsCount,
  getCartItemsTotal,
  getDeliveryPrice,
  isRealCart,
} from '../lib/cart.helpers';
import { CartGroupCard } from './cart-group-card';
import { CartSummaryCard } from './cart-summary-card';
import { CartBenefitsCard } from './cart-benefits-card';

export function CartPage() {
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const currentUserQuery = useCurrentUserQuery();
  const cartQuery = useCurrentCartQuery();

  if (cartQuery.isLoading) {
    return (
      <div className="rv-container-wide py-12 text-ink-soft">
        Загружаем корзину...
      </div>
    );
  }

  if (cartQuery.isError) {
    return (
      <div className="rv-container-wide py-12">
        <div className="rounded-card border border-line/60 p-8">
          <h1 className="text-2xl font-semibold text-ink">
            Не удалось загрузить корзину
          </h1>
          <p className="mt-2 text-ink-soft">{cartQuery.error.message}</p>
        </div>
      </div>
    );
  }

  const cart = cartQuery.data;

  const items = isRealCart(cart) ? cart.items : [];
  const groups = getCartGroups(items);
  const itemsCount = getCartItemsCount(items);
  const totalAmount = getCartItemsTotal(items);
  const deliveryPrice = getDeliveryPrice(totalAmount);
  const finalAmount = totalAmount + deliveryPrice;

  const handleCheckout = () => {
    if (!currentUserQuery.data) {
      setAuthModalOpen(true);
      return;
    }

    // Следующим этапом сделаем /checkout или checkout modal/form.
    // Пока просто оставляем точку входа.
    console.log('go checkout');
  };

  return (
    <div className="min-h-full bg-white">
      <CartTopbar itemsCount={itemsCount} />

      <div className="rv-container-wide py-12">
        <div className="mb-10 max-w-3xl">
          <p className="rv-eyebrow mb-3">Корзина</p>

          <h1 className="text-section-title text-ink">
            Готовы оформить{' '}
            <span className="font-normal italic text-brand">заказ</span>?
          </h1>

          <p className="mt-3 text-body-lg text-ink-soft">
            Товары сгруппированы по дизайн-проектам. Можно убрать ненужное или
            докинуть пару вещей из каталога.
          </p>
        </div>

        {items.length === 0 ? (
          <CartEmptyState />
        ) : (
          <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
            <main className="space-y-8">
              {groups.map((group) => (
                <CartGroupCard key={group.key} group={group} />
              ))}

              <Link
                href="/catalog"
                className="block rounded-lg border border-dashed border-line p-6 text-center text-ink-soft transition-colors hover:border-brand hover:text-brand"
              >
                + Добавить товары из каталога
              </Link>
            </main>

            <aside className="space-y-5 lg:sticky lg:top-28 lg:self-start">
              <CartSummaryCard
                cartId={isRealCart(cart) ? cart.id : null}
                itemsCount={itemsCount}
                totalAmount={totalAmount}
                deliveryPrice={deliveryPrice}
                finalAmount={finalAmount}
                onCheckout={handleCheckout}
              />

              <CartBenefitsCard />
            </aside>
          </div>
        )}
      </div>

      <AuthRequiredModal
        open={authModalOpen}
        reason="checkout-required"
        initialMode="register"
        onClose={() => setAuthModalOpen(false)}
        onSuccess={() => {
          setAuthModalOpen(false);
        }}
      />
    </div>
  );
}

function CartTopbar({ itemsCount }: { itemsCount: number }) {
  return (
    <div className="border-b border-line/40">
      <div className="rv-container-wide flex items-center justify-between gap-6 py-5">
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-ink-soft transition hover:text-brand">
            Главная
          </Link>

          <span className="text-line">·</span>

          <span className="font-medium text-ink">Корзина</span>
        </div>

        <span className="text-sm text-ink-soft">
          {itemsCount} {getProductPlural(itemsCount)}
        </span>
      </div>
    </div>
  );
}

function CartEmptyState() {
  return (
    <div className="rounded-card border border-line/60 p-16 text-center">
      <div className="mx-auto mb-6 flex size-20 items-center justify-center rounded-pill bg-brand-soft">
        <ShoppingBag className="size-9 text-brand" />
      </div>

      <h2 className="mb-3 text-3xl font-semibold tracking-tight text-ink">
        Корзина пока пуста
      </h2>

      <p className="mx-auto mb-8 max-w-md text-ink-soft">
        Создайте дизайн-проект — и мы сами подберём подходящие товары из
        каталога.
      </p>

      <Link
        href="/create"
        className="inline-flex items-center gap-2 rounded-pill bg-dark px-6 py-3 text-white transition-colors hover:bg-brand"
      >
        <Sparkles size={16} />
        Создать дизайн
      </Link>
    </div>
  );
}

function getProductPlural(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) return 'товар';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'товара';
  }

  return 'товаров';
}
