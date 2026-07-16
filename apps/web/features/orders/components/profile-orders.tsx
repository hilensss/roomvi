'use client';

import { ChevronDown, Package, RotateCcw, Truck } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/features/cart/lib/cart.helpers';
import { cn } from '@/shared/lib/cn';
import { Modal } from '@/shared/ui/modal';
import {
  useCancelOrderMutation,
  useOrderQuery,
  useOrdersInfiniteQuery,
} from '../api/orders-queries';
import {
  formatOrderDate,
  fulfillmentStatusMeta,
  orderStatusMeta,
  paymentStatusMeta,
} from '../lib/order-display';
import { canCustomerCancel } from '../lib/order-state-ui';
import type {
  OrderDetail,
  OrderSummary,
  PublicOrderItem,
} from '../model/order.types';

export function ProfileOrders({ initialOrderId }: { initialOrderId?: string }) {
  const ordersQuery = useOrdersInfiniteQuery(20);

  if (ordersQuery.isLoading) {
    return <OrdersState>Загружаем историю заказов...</OrdersState>;
  }

  if (ordersQuery.isError || !ordersQuery.data) {
    return <OrdersState>Не удалось загрузить заказы. Попробуйте снова.</OrdersState>;
  }

  const orders = ordersQuery.data.pages.flatMap((page) => page.items);
  if (orders.length === 0) {
    return (
      <OrdersState>
        <h3 className="text-2xl font-semibold text-ink">Заказов пока нет</h3>
        <p className="mt-2 text-ink-soft">
          Когда оформите первый заказ, он появится здесь.
        </p>
      </OrdersState>
    );
  }

  return (
    <div>
      <div className="space-y-4">
        {orders.map((order) => (
          <OrderAccordionItem
            key={order.id}
            order={order}
            initiallyOpen={order.id === initialOrderId}
          />
        ))}
      </div>

      {ordersQuery.hasNextPage ? (
        <button
          type="button"
          disabled={ordersQuery.isFetchingNextPage}
          onClick={() => ordersQuery.fetchNextPage()}
          className="mx-auto mt-7 flex rounded-pill border border-line/60 px-6 py-3 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:opacity-60"
        >
          {ordersQuery.isFetchingNextPage ? 'Загружаем...' : 'Показать ещё'}
        </button>
      ) : null}
    </div>
  );
}

function OrderAccordionItem({
  order,
  initiallyOpen,
}: {
  order: OrderSummary;
  initiallyOpen: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const detailQuery = useOrderQuery(order.id, open);

  return (
    <article className="overflow-hidden rounded-card border border-line/60 bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="grid w-full items-center gap-4 px-5 py-5 text-left transition hover:bg-line/10 md:grid-cols-[150px_150px_1fr_auto_auto] md:px-7"
      >
        <div>
          <div className="font-mono font-semibold text-ink">
            Заказ №{order.number}
          </div>
          <div className="mt-1 text-xs text-ink-soft">
            {order.itemCount} товар.
          </div>
        </div>
        <div className="text-sm text-ink-soft">{formatOrderDate(order.createdAt)}</div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge meta={orderStatusMeta[order.status]} />
          <StatusBadge meta={paymentStatusMeta[order.paymentStatus]} />
          <StatusBadge meta={fulfillmentStatusMeta[order.fulfillmentStatus]} />
        </div>
        <div className="font-semibold text-ink">{formatMoney(order.totalAmount)}</div>
        <ChevronDown
          className={cn(
            'size-5 text-ink-soft transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-line/40 bg-[#fbfaf8] px-5 py-6 md:px-7">
          {detailQuery.isLoading ? (
            <div className="text-sm text-ink-soft">Загружаем детали заказа...</div>
          ) : detailQuery.isError || !detailQuery.data ? (
            <div className="text-sm text-red-700">
              Не удалось загрузить детали заказа.
            </div>
          ) : (
            <OrderDetailView order={detailQuery.data} />
          )}
        </div>
      ) : null}
    </article>
  );
}

function OrderDetailView({ order }: { order: OrderDetail }) {
  const cancelMutation = useCancelOrderMutation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const cancellable = canCustomerCancel(
    order.status,
    order.paymentStatus,
    order.fulfillmentStatus,
  );

  async function confirmCancellation() {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync(order.id);
      setConfirmOpen(false);
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: unknown }).status)
          : null;
      setCancelError(
        status === 409
          ? 'Отмена уже недоступна: оплата или выполнение заказа начались.'
          : error instanceof Error
            ? error.message
            : 'Не удалось отменить заказ.',
      );
    }
  }

  return (
    <div className="space-y-7">
      {order.payment?.provider === 'MANUAL' &&
      order.payment.status === 'PENDING' ? (
        <div className="rounded-lg border border-brand/20 bg-brand-soft p-4 text-sm text-ink">
          Заявка оформлена — менеджер свяжется с вами для подтверждения заказа
          и оплаты.
        </div>
      ) : null}

      <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
        <div>
          <h3 className="mb-4 flex items-center gap-2 font-semibold text-ink">
            <Package className="size-4 text-brand" />
            Состав заказа
          </h3>
          <div className="space-y-3">
            {order.items.map((item) => (
              <PublicOrderItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <h3 className="mb-3 flex items-center gap-2 font-semibold text-ink">
              <Truck className="size-4 text-brand" />
              Доставка
            </h3>
            <div className="space-y-1 text-sm text-ink-soft">
              <p className="font-medium text-ink">
                {[order.deliveryCity, order.deliveryAddress]
                  .filter(Boolean)
                  .join(', ')}
              </p>
              {order.deliveryPostalCode ? <p>{order.deliveryPostalCode}</p> : null}
              {order.deliveryComment ? <p>{order.deliveryComment}</p> : null}
            </div>
          </div>

          {order.payment ? (
            <div>
              <h3 className="mb-3 font-semibold text-ink">Оплата</h3>
              <div className="rounded-lg border border-line/40 bg-white p-4 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-ink">
                      {order.payment.provider === 'MANUAL'
                        ? 'Через менеджера'
                        : 'Банковская оплата'}
                    </div>
                    <div className="mt-1 text-xs text-ink-soft">
                      {formatMoney(order.payment.amount)} ·{' '}
                      {order.payment.currency}
                    </div>
                    {order.payment.paidAt ? (
                      <div className="mt-1 text-xs text-ink-soft">
                        Оплачено {formatOrderDate(order.payment.paidAt)}
                      </div>
                    ) : null}
                  </div>
                  <StatusBadge meta={paymentStatusMeta[order.payment.status]} />
                </div>
              </div>
            </div>
          ) : null}

          {order.customerComment ? (
            <div>
              <h3 className="mb-2 font-semibold text-ink">Комментарий</h3>
              <p className="text-sm text-ink-soft">{order.customerComment}</p>
            </div>
          ) : null}

          <div className="border-t border-line/50 pt-4 text-sm">
            <div className="flex justify-between text-ink-soft">
              <span>Товары</span>
              <span>{formatMoney(order.subtotalAmount)}</span>
            </div>
            <div className="mt-2 flex justify-between text-ink-soft">
              <span>Доставка</span>
              <span>{formatMoney(order.deliveryAmount)}</span>
            </div>
            <div className="mt-3 flex justify-between font-semibold text-ink">
              <span>Итого</span>
              <span>{formatMoney(order.totalAmount)}</span>
            </div>
          </div>

          {cancellable ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 text-sm text-ink-soft transition hover:text-red-700"
            >
              <RotateCcw size={14} />
              Отменить заказ
            </button>
          ) : null}
          {cancelError ? <p className="text-sm text-red-700">{cancelError}</p> : null}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Отменить заказ?"
        description="Корзина не будет восстановлена. Это действие нельзя отменить."
      >
        <div className="mt-3 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-pill border border-line px-5 py-2.5 text-sm text-ink"
          >
            Оставить заказ
          </button>
          <button
            type="button"
            disabled={cancelMutation.isPending}
            onClick={confirmCancellation}
            className="rounded-pill bg-red-700 px-5 py-2.5 text-sm text-white disabled:opacity-60"
          >
            Да, отменить
          </button>
        </div>
      </Modal>
    </div>
  );
}

function PublicOrderItemRow({ item }: { item: PublicOrderItem }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-line/40 bg-white p-4">
      <div className="min-w-0">
        <div className="font-medium text-ink">{item.titleSnapshot}</div>
        <div className="mt-1 text-xs text-ink-soft">
          {item.quantity} шт. × {formatMoney(item.priceSnapshot)}
        </div>
      </div>
      <div className="shrink-0 font-semibold text-ink">
        {formatMoney(item.totalPrice)}
      </div>
    </div>
  );
}

function StatusBadge({
  meta,
}: {
  meta: { label: string; className: string };
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-pill px-3 py-1 text-xs font-medium',
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

function OrdersState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line/60 p-10 text-center text-ink-soft">
      {children}
    </div>
  );
}
