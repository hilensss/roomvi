'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '@/features/cart/lib/cart.helpers';
import {
  formatOrderDate,
  fulfillmentStatusMeta,
  orderStatusMeta,
  paymentStatusMeta,
  procurementStatusMeta,
} from '@/features/orders/lib/order-display';
import {
  canCustomerCancel,
  getNextOrderStatuses,
  getNextProcurementStatuses,
} from '@/features/orders/lib/order-state-ui';
import type {
  OrderItemProcurementStatus,
  OrderStatus,
} from '@/features/orders/model/order.types';
import { cn } from '@/shared/lib/cn';
import {
  useAdminOrderQuery,
  useUpdateAdminItemCommentMutation,
  useUpdateAdminItemProcurementMutation,
  useUpdateAdminOrderCommentMutation,
  useUpdateAdminOrderStatusMutation,
} from '../api/admin-orders-queries';
import type {
  AdminOrder,
  AdminOrderItem,
} from '../model/admin-order.types';

export function AdminOrderDetailPage({ orderId }: { orderId: string }) {
  const orderQuery = useAdminOrderQuery(orderId);

  if (orderQuery.isLoading) {
    return <DetailState>Загружаем заказ...</DetailState>;
  }
  if (orderQuery.isError || !orderQuery.data) {
    return <DetailState>Заказ не найден или не удалось его загрузить.</DetailState>;
  }

  return <AdminOrderDetail order={orderQuery.data} />;
}

function AdminOrderDetail({ order }: { order: AdminOrder }) {
  const statusMutation = useUpdateAdminOrderStatusMutation();
  const [statusError, setStatusError] = useState<string | null>(null);
  const nextStatuses = getNextOrderStatuses(order.status).filter(
    (status) =>
      status !== 'CANCELLED' ||
      canCustomerCancel(
        order.status,
        order.paymentStatus,
        order.fulfillmentStatus,
      ),
  );

  async function changeStatus(status: OrderStatus) {
    setStatusError(null);
    try {
      await statusMutation.mutateAsync({ orderId: order.id, status });
    } catch (error) {
      setStatusError(actionErrorMessage(error));
    }
  }

  return (
    <div className="min-h-full bg-[#f7f6f3]">
      <div className="border-b border-line/40 bg-dark text-white">
        <div className="rv-container-wide flex items-center justify-between py-4">
          <Link href="/admin/orders" className="flex items-center gap-3 font-semibold">
            <ShieldCheck className="size-5 text-brand" /> ROOMVI · ADMIN
          </Link>
          <Link href="/account" className="text-sm text-line transition hover:text-white">
            Личный кабинет
          </Link>
        </div>
      </div>

      <div className="rv-container-wide py-8 md:py-10">
        <Link
          href="/admin/orders"
          className="mb-6 inline-flex items-center gap-2 text-sm text-ink-soft transition hover:text-brand"
        >
          <ArrowLeft size={15} /> Все заказы
        </Link>

        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="rv-eyebrow mb-2">Заказ от {formatOrderDate(order.createdAt)}</p>
            <h1 className="text-section-title text-ink">Заказ №{order.number}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <StatusPill meta={orderStatusMeta[order.status]} />
              <StatusPill meta={paymentStatusMeta[order.paymentStatus]} />
              <StatusPill meta={fulfillmentStatusMeta[order.fulfillmentStatus]} />
            </div>
          </div>

          <label className="w-full max-w-sm text-sm text-ink-soft">
            <span className="mb-1.5 block">Статус заказа</span>
            <select
              value={order.status}
              disabled={statusMutation.isPending || nextStatuses.length === 0}
              onChange={(event) => changeStatus(event.target.value as OrderStatus)}
              className="rv-input h-12 bg-white py-2.5"
            >
              <option value={order.status}>{orderStatusMeta[order.status].label}</option>
              {nextStatuses.map((status) => (
                <option key={status} value={status}>{orderStatusMeta[status].label}</option>
              ))}
            </select>
            {nextStatuses.length === 0 ? (
              <span className="mt-1.5 block text-xs">Нет доступных переходов</span>
            ) : null}
            {statusError ? <span className="mt-1.5 block text-xs text-red-700">{statusError}</span> : null}
          </label>
        </div>

        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-7">
            <section className="rounded-card border border-line/50 bg-white p-5 md:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="rv-eyebrow mb-1">Закупка</p>
                  <h2 className="text-2xl font-semibold text-ink">Позиции заказа</h2>
                </div>
                <StatusPill meta={fulfillmentStatusMeta[order.fulfillmentStatus]} />
              </div>
              <div className="space-y-4">
                {order.items.map((item) => (
                  <AdminOrderItemCard
                    key={`${item.id}:${item.updatedAt}:${item.managerComment ?? ''}`}
                    orderId={order.id}
                    item={item}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-card border border-line/50 bg-white p-5 md:p-7">
              <div className="mb-5">
                <p className="rv-eyebrow mb-1">Агрегаты</p>
                <h2 className="text-2xl font-semibold text-ink">Заказы поставщикам</h2>
              </div>
              {order.supplierOrders.length === 0 ? (
                <p className="text-sm text-ink-soft">Агрегаты поставщиков не созданы.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {order.supplierOrders.map((supplierOrder) => (
                    <div key={supplierOrder.id} className="rounded-lg border border-line/50 p-4">
                      <div className="font-medium text-ink">
                        {supplierOrder.supplier?.name ?? supplierOrder.supplierId}
                      </div>
                      <div className="mt-2 text-sm text-ink-soft">
                        Статус: {supplierOrder.status}
                      </div>
                      <div className="mt-1 text-xs text-ink-soft">
                        External ID: {supplierOrder.externalOrderId ?? '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="space-y-6 xl:sticky xl:top-28">
            <InfoCard title="Клиент">
              <div className="font-medium text-ink">{order.customerName}</div>
              <a href={`tel:${order.customerPhone}`} className="mt-3 flex items-center gap-2 text-sm text-ink-soft hover:text-brand">
                <Phone size={14} /> {order.customerPhone}
              </a>
              {order.customerEmail ? (
                <a href={`mailto:${order.customerEmail}`} className="mt-2 flex items-center gap-2 text-sm text-ink-soft hover:text-brand">
                  <Mail size={14} /> {order.customerEmail}
                </a>
              ) : null}
            </InfoCard>

            <InfoCard title="Доставка">
              <div className="flex gap-2 text-sm text-ink">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{[order.deliveryCity, order.deliveryAddress].filter(Boolean).join(', ')}</span>
              </div>
              {order.deliveryPostalCode ? <p className="mt-2 text-sm text-ink-soft">Индекс: {order.deliveryPostalCode}</p> : null}
              {order.deliveryComment ? <p className="mt-3 text-sm text-ink-soft">{order.deliveryComment}</p> : null}
            </InfoCard>

            <InfoCard title="Суммы и оплата">
              <MoneyRow label="Товары" value={order.subtotalAmount} />
              <MoneyRow label="Доставка" value={order.deliveryAmount} />
              <div className="mt-3 flex justify-between border-t border-line/50 pt-3 font-semibold text-ink">
                <span>Итого</span><span>{formatMoney(order.totalAmount)}</span>
              </div>
              {order.payment ? (
                <div className="mt-4 rounded-lg bg-line/15 p-3 text-xs text-ink-soft">
                  <div>{order.payment.provider} · {paymentStatusMeta[order.payment.status].label}</div>
                  <div className="mt-1 font-mono">{order.payment.id}</div>
                  {order.payment.failureMessage ? <div className="mt-2 text-red-700">{order.payment.failureMessage}</div> : null}
                </div>
              ) : null}
            </InfoCard>

            {order.customerComment ? (
              <InfoCard title="Комментарий клиента">
                <p className="text-sm text-ink-soft">{order.customerComment}</p>
              </InfoCard>
            ) : null}

            <InfoCard title="Комментарий менеджера">
              <ManagerCommentEditor
                label="Комментарий менеджера к заказу"
                initialValue={order.managerComment}
                buttonLabel="Сохранить комментарий к заказу"
                onSave={(managerComment) => ({
                  orderId: order.id,
                  managerComment,
                })}
                useMutation={useUpdateAdminOrderCommentMutation}
              />
            </InfoCard>
          </aside>
        </div>
      </div>
    </div>
  );
}

function AdminOrderItemCard({ orderId, item }: { orderId: string; item: AdminOrderItem }) {
  const procurementMutation = useUpdateAdminItemProcurementMutation();
  const commentMutation = useUpdateAdminItemCommentMutation();
  const [comment, setComment] = useState(item.managerComment ?? '');
  const [savedComment, setSavedComment] = useState(item.managerComment ?? '');
  const [error, setError] = useState<string | null>(null);
  const nextStatuses = getNextProcurementStatuses(item.procurementStatus);

  async function updateProcurement(procurementStatus: OrderItemProcurementStatus) {
    setError(null);
    try {
      await procurementMutation.mutateAsync({ orderId, itemId: item.id, procurementStatus });
    } catch (mutationError) {
      setError(actionErrorMessage(mutationError));
    }
  }

  async function saveComment() {
    setError(null);
    try {
      await commentMutation.mutateAsync({ orderId, itemId: item.id, managerComment: comment });
      setSavedComment(comment.trim());
    } catch (mutationError) {
      setError(actionErrorMessage(mutationError));
    }
  }

  return (
    <article className="rounded-lg border border-line/50 bg-[#fbfaf8] p-4 md:p-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-ink">{item.titleSnapshot}</h3>
              <p className="mt-1 text-sm text-ink-soft">
                {item.quantity} шт. × {formatMoney(item.priceSnapshot)} · {formatMoney(item.totalPrice)}
              </p>
            </div>
            <StatusPill meta={procurementStatusMeta[item.procurementStatus]} />
          </div>
          <div className="mt-4 grid gap-2 text-xs text-ink-soft sm:grid-cols-2">
            <div>Поставщик: <span className="text-ink">{item.supplierNameSnapshot}</span></div>
            <div>SKU: <span className="font-mono text-ink">{item.externalProductId}</span></div>
          </div>
          {item.productUrlSnapshot ? (
            <a href={item.productUrlSnapshot} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand hover:underline">
              Карточка поставщика <ExternalLink size={12} />
            </a>
          ) : null}
        </div>

        <label className="text-sm text-ink-soft">
          <span className="mb-1.5 block">Закупка: {item.titleSnapshot}</span>
          <select
            value={item.procurementStatus}
            disabled={procurementMutation.isPending || nextStatuses.length === 0}
            onChange={(event) => updateProcurement(event.target.value as OrderItemProcurementStatus)}
            className="rv-input h-11 bg-white py-2.5"
          >
            <option value={item.procurementStatus}>{procurementStatusMeta[item.procurementStatus].label}</option>
            {nextStatuses.map((status) => (
              <option key={status} value={status}>{procurementStatusMeta[status].label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 border-t border-line/40 pt-4">
        <label className="text-sm text-ink-soft">
          <span className="mb-1.5 block">Комментарий менеджера к позиции</span>
          <textarea
            value={comment}
            maxLength={2000}
            rows={2}
            onChange={(event) => setComment(event.target.value)}
            className="rv-input min-h-20 resize-y bg-white"
          />
        </label>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-soft">{comment.length}/2000</span>
          <button
            type="button"
            disabled={commentMutation.isPending || comment === savedComment}
            onClick={saveComment}
            className="inline-flex items-center gap-2 rounded-pill bg-dark px-4 py-2 text-xs text-white transition hover:bg-brand disabled:opacity-40"
          >
            <Save size={13} /> Сохранить комментарий позиции
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      </div>
    </article>
  );
}

function ManagerCommentEditor({
  label,
  initialValue,
  buttonLabel,
  onSave,
  useMutation,
}: {
  label: string;
  initialValue: string | null;
  buttonLabel: string;
  onSave: (value: string) => { orderId: string; managerComment: string };
  useMutation: typeof useUpdateAdminOrderCommentMutation;
}) {
  const mutation = useMutation();
  const [value, setValue] = useState(initialValue ?? '');
  const [savedValue, setSavedValue] = useState(initialValue ?? '');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await mutation.mutateAsync(onSave(value));
      setSavedValue(value.trim());
    } catch (mutationError) {
      setError(actionErrorMessage(mutationError));
    }
  }

  return (
    <div>
      <label className="text-sm text-ink-soft">
        <span className="sr-only">{label}</span>
        <textarea
          aria-label={label}
          value={value}
          maxLength={2000}
          rows={5}
          onChange={(event) => setValue(event.target.value)}
          className="rv-input min-h-32 resize-y"
        />
      </label>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-ink-soft">{value.length}/2000</span>
        <button
          type="button"
          disabled={mutation.isPending || value === savedValue}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-pill bg-dark px-4 py-2 text-xs text-white transition hover:bg-brand disabled:opacity-40"
        >
          <Save size={13} /> {buttonLabel}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line/50 bg-white p-5">
      <h2 className="mb-4 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function MoneyRow({ label, value }: { label: string; value: number }) {
  return <div className="mb-2 flex justify-between text-sm text-ink-soft"><span>{label}</span><span>{formatMoney(value)}</span></div>;
}

function StatusPill({ meta }: { meta: { label: string; className: string } }) {
  return <span className={cn('w-fit rounded-pill px-3 py-1 text-xs font-medium', meta.className)}>{meta.label}</span>;
}

function DetailState({ children }: { children: React.ReactNode }) {
  return <div className="rv-container-wide py-16 text-center text-ink-soft">{children}</div>;
}

function actionErrorMessage(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : null;
  if (status === 409) return 'Состояние заказа изменилось. Данные обновлены, повторите действие.';
  return error instanceof Error ? error.message : 'Не удалось сохранить изменение.';
}
