'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FilterX, Search, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { formatMoney } from '@/features/cart/lib/cart.helpers';
import {
  formatOrderDate,
  fulfillmentStatusMeta,
  orderStatusMeta,
  paymentStatusMeta,
} from '@/features/orders/lib/order-display';
import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '@/features/orders/model/order.types';
import { cn } from '@/shared/lib/cn';
import { useAdminOrdersQuery } from '../api/admin-orders-queries';
import {
  buildAdminOrdersSearchParams,
  parseAdminOrderFilters,
} from '../lib/admin-order-filters';
import type {
  AdminOrder,
  AdminOrderFilters,
} from '../model/admin-order.types';

const orderStatuses = Object.keys(orderStatusMeta) as OrderStatus[];
const paymentStatuses = Object.keys(paymentStatusMeta) as PaymentStatus[];
const fulfillmentStatuses = Object.keys(
  fulfillmentStatusMeta,
) as FulfillmentStatus[];

type TextFilterField = keyof Pick<
  AdminOrderFilters,
  | 'number'
  | 'customerEmail'
  | 'customerPhone'
  | 'createdFrom'
  | 'createdTo'
  | 'search'
>;

export function AdminOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const serializedSearch = searchParams.toString();
  const filters = useMemo(
    () => parseAdminOrderFilters(new URLSearchParams(serializedSearch)),
    [serializedSearch],
  );
  const apiParams = useMemo(
    () => buildAdminOrdersSearchParams(filters),
    [filters],
  );
  const ordersQuery = useAdminOrdersQuery(apiParams);

  function replaceFilters(next: AdminOrderFilters) {
    const params = buildAdminOrdersSearchParams(next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setSelectFilter(
    field: 'status' | 'paymentStatus' | 'fulfillmentStatus',
    value: string,
  ) {
    replaceFilters({
      ...filters,
      offset: 0,
      [field]: value || undefined,
    });
  }

  function setTextFilter(field: TextFilterField, value: string) {
    replaceFilters({
      ...filters,
      offset: 0,
      [field]: value || undefined,
    });
  }

  const data = ordersQuery.data;
  const from = data && data.total > 0 ? data.offset + 1 : 0;
  const to = data ? Math.min(data.offset + data.items.length, data.total) : 0;

  return (
    <div className="min-h-full bg-[#f7f6f3]">
      <AdminTopbar />
      <div className="rv-container-wide py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="rv-eyebrow mb-2">Операционный центр</p>
            <h1 className="text-section-title text-ink">Заказы</h1>
            <p className="mt-2 text-ink-soft">
              Контроль оформления, оплаты и закупки товаров.
            </p>
          </div>
          {data ? (
            <div className="text-sm text-ink-soft">Всего: {data.total}</div>
          ) : null}
        </div>

        <section className="mb-6 rounded-card border border-line/50 bg-white p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <FilterInput
              label="Поиск"
              value={filters.search ?? ''}
              placeholder="Имя, email или телефон"
              onChange={(value) => setTextFilter('search', value)}
              icon={<Search size={15} />}
            />
            <FilterInput
              label="Номер заказа"
              value={filters.number ?? ''}
              inputMode="numeric"
              onChange={(value) => setTextFilter('number', value)}
            />
            <FilterInput
              label="Email"
              value={filters.customerEmail ?? ''}
              onChange={(value) => setTextFilter('customerEmail', value)}
            />
            <FilterInput
              label="Телефон"
              value={filters.customerPhone ?? ''}
              onChange={(value) => setTextFilter('customerPhone', value)}
            />

            <FilterSelect
              label="Статус заказа"
              value={filters.status ?? ''}
              onChange={(value) => setSelectFilter('status', value)}
              options={orderStatuses.map((value) => ({
                value,
                label: orderStatusMeta[value].label,
              }))}
            />
            <FilterSelect
              label="Статус оплаты"
              value={filters.paymentStatus ?? ''}
              onChange={(value) => setSelectFilter('paymentStatus', value)}
              options={paymentStatuses.map((value) => ({
                value,
                label: paymentStatusMeta[value].label,
              }))}
            />
            <FilterSelect
              label="Статус выполнения"
              value={filters.fulfillmentStatus ?? ''}
              onChange={(value) => setSelectFilter('fulfillmentStatus', value)}
              options={fulfillmentStatuses.map((value) => ({
                value,
                label: fulfillmentStatusMeta[value].label,
              }))}
            />
            <FilterSelect
              label="На странице"
              value={String(filters.limit)}
              onChange={(value) =>
                replaceFilters({
                  ...filters,
                  limit: Number(value) as 20 | 50 | 100,
                  offset: 0,
                })
              }
              options={[20, 50, 100].map((value) => ({
                value: String(value),
                label: String(value),
              }))}
              includeEmpty={false}
            />
            <FilterInput
              label="Создан с"
              type="date"
              value={filters.createdFrom ?? ''}
              onChange={(value) => setTextFilter('createdFrom', value)}
            />
            <FilterInput
              label="Создан по"
              type="date"
              value={filters.createdTo ?? ''}
              onChange={(value) => setTextFilter('createdTo', value)}
            />
            <button
              type="button"
              onClick={() =>
                replaceFilters({ limit: filters.limit, offset: 0 })
              }
              className="flex h-11 items-center justify-center gap-2 self-end rounded-pill border border-line/60 text-sm text-ink-soft transition hover:border-brand hover:text-brand"
            >
              <FilterX size={15} />
              Сбросить фильтры
            </button>
          </div>
        </section>

        {ordersQuery.isLoading ? (
          <ListState>Загружаем заказы...</ListState>
        ) : ordersQuery.isError || !data ? (
          <ListState>Не удалось загрузить список заказов.</ListState>
        ) : data.items.length === 0 ? (
          <ListState>По выбранным фильтрам заказов нет.</ListState>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-card border border-line/50 bg-white lg:block">
              <div className="grid grid-cols-[110px_150px_1.4fr_1fr_1fr_1fr_130px] gap-4 bg-line/15 px-5 py-4 text-xs uppercase tracking-[0.14em] text-ink-soft">
                <div>Номер</div><div>Дата</div><div>Клиент</div><div>Заказ</div><div>Оплата</div><div>Закупка</div><div className="text-right">Сумма</div>
              </div>
              <div className="divide-y divide-line/40">
                {data.items.map((order) => (
                  <AdminOrderRow key={order.id} order={order} />
                ))}
              </div>
            </div>

            <div className="space-y-4 lg:hidden">
              {data.items.map((order) => (
                <AdminOrderCard key={order.id} order={order} />
              ))}
            </div>

            <div className="mt-6 flex flex-col items-center justify-between gap-4 text-sm text-ink-soft sm:flex-row">
              <span>Показано {from}–{to} из {data.total}</span>
              <div className="flex gap-2">
                <PaginationButton
                  disabled={filters.offset === 0}
                  onClick={() =>
                    replaceFilters({
                      ...filters,
                      offset: Math.max(0, filters.offset - filters.limit),
                    })
                  }
                >
                  Назад
                </PaginationButton>
                <PaginationButton
                  disabled={filters.offset + filters.limit >= data.total}
                  onClick={() =>
                    replaceFilters({
                      ...filters,
                      offset: filters.offset + filters.limit,
                    })
                  }
                >
                  Вперёд
                </PaginationButton>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminTopbar() {
  return (
    <div className="border-b border-line/40 bg-dark text-white">
      <div className="rv-container-wide flex items-center justify-between py-4">
        <Link href="/admin/orders" className="flex items-center gap-3 font-semibold">
          <ShieldCheck className="size-5 text-brand" />
          ROOMVI · ADMIN
        </Link>
        <Link href="/account" className="text-sm text-line transition hover:text-white">
          Личный кабинет
        </Link>
      </div>
    </div>
  );
}

function AdminOrderRow({ order }: { order: AdminOrder }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      aria-label={`Заказ №${order.number}`}
      className="grid grid-cols-[110px_150px_1.4fr_1fr_1fr_1fr_130px] items-center gap-4 px-5 py-4 text-sm transition hover:bg-line/10"
    >
      <span className="font-mono font-semibold text-ink">№{order.number}</span>
      <span className="text-ink-soft">{formatOrderDate(order.createdAt)}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-ink">{order.customerName}</span>
        <span className="block truncate text-xs text-ink-soft">{order.customerPhone}</span>
      </span>
      <StatusPill meta={orderStatusMeta[order.status]} />
      <StatusPill meta={paymentStatusMeta[order.paymentStatus]} />
      <StatusPill meta={fulfillmentStatusMeta[order.fulfillmentStatus]} />
      <span className="text-right font-semibold text-ink">{formatMoney(order.totalAmount)}</span>
    </Link>
  );
}

function AdminOrderCard({ order }: { order: AdminOrder }) {
  return (
    <Link
      href={`/admin/orders/${order.id}`}
      aria-label={`Заказ №${order.number}`}
      className="block rounded-card border border-line/50 bg-white p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono font-semibold text-ink">№{order.number}</div>
          <div className="mt-1 text-sm text-ink-soft">{formatOrderDate(order.createdAt)}</div>
        </div>
        <div className="font-semibold text-ink">{formatMoney(order.totalAmount)}</div>
      </div>
      <div className="mt-4 font-medium text-ink">{order.customerName}</div>
      <div className="text-sm text-ink-soft">{order.customerPhone}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill meta={orderStatusMeta[order.status]} />
        <StatusPill meta={paymentStatusMeta[order.paymentStatus]} />
        <StatusPill meta={fulfillmentStatusMeta[order.fulfillmentStatus]} />
      </div>
    </Link>
  );
}

function StatusPill({ meta }: { meta: { label: string; className: string } }) {
  return (
    <span className={cn('w-fit rounded-pill px-2.5 py-1 text-xs font-medium', meta.className)}>
      {meta.label}
    </span>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  icon,
  ...props
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <label className="text-sm text-ink-soft">
      <span className="mb-1.5 block">{label}</span>
      <span className="relative block">
        {icon ? <span className="absolute left-3 top-3 text-ink-soft">{icon}</span> : null}
        <input
          key={value}
          {...props}
          defaultValue={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            if (timeoutRef.current !== null) {
              window.clearTimeout(timeoutRef.current);
            }
            timeoutRef.current = window.setTimeout(
              () => onChange(nextValue),
              300,
            );
          }}
          className={cn('rv-input h-11 py-2.5', icon && 'pl-9')}
        />
      </span>
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  includeEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  includeEmpty?: boolean;
}) {
  return (
    <label className="text-sm text-ink-soft">
      <span className="mb-1.5 block">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rv-input h-11 py-2.5"
      >
        {includeEmpty ? <option value="">Все</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function PaginationButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-pill border border-line/60 px-5 py-2.5 transition hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ListState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line/50 bg-white p-12 text-center text-ink-soft">
      {children}
    </div>
  );
}
