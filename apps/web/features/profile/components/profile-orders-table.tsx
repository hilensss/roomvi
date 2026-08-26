import { CheckCircle2, Clock, Package, Truck } from 'lucide-react';
import type { Order } from '@/shared/api/types';
import { formatMoney } from '@/features/catalog/lib/catalog.helpers';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/i18n/locale';
import { useLocale } from '@/shared/providers/locale-provider';

type ProfileOrdersTableProps = {
  orders: Order[];
};

const statusMap = {
  DRAFT: {
    label: 'Черновик',
    icon: Clock,
    className: 'bg-line/30 text-ink-soft',
  },
  CREATED: {
    label: 'Создан',
    icon: Clock,
    className: 'bg-line/30 text-ink-soft',
  },
  PAID: {
    label: 'Оплачен',
    icon: CheckCircle2,
    className: 'bg-brand-soft text-brand',
  },
  PROCESSING: {
    label: 'Собирается',
    icon: Clock,
    className: 'bg-line/30 text-ink-soft',
  },
  SHIPPED: {
    label: 'В пути',
    icon: Truck,
    className: 'bg-dark/10 text-ink',
  },
  DELIVERED: {
    label: 'Доставлен',
    icon: CheckCircle2,
    className: 'bg-brand-soft text-brand',
  },
  CANCELLED: {
    label: 'Отменён',
    icon: Clock,
    className: 'bg-line/30 text-ink-soft',
  },
} as const;

export function ProfileOrdersTable({ orders }: ProfileOrdersTableProps) {
  const { locale } = useLocale();

  if (orders.length === 0) {
    return (
      <div className="rounded-card border border-line/60 p-10 text-center">
        <h3 className="text-2xl font-semibold text-ink">Заказов пока нет</h3>
        <p className="mt-2 text-ink-soft">
          Когда оформите первый заказ, он появится здесь.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line/60">
      <div className="hidden grid-cols-12 gap-4 bg-line/15 px-6 py-4 text-xs uppercase tracking-[0.2em] text-ink-soft md:grid">
        <div className="col-span-2">Заказ</div>
        <div className="col-span-2">Дата</div>
        <div className="col-span-4">Проект</div>
        <div className="col-span-2">Статус</div>
        <div className="col-span-2 text-right">Сумма</div>
      </div>

      <div className="divide-y divide-line/40">
        {orders.map((order) => {
          const status =
            statusMap[order.status as keyof typeof statusMap] ??
            statusMap.CREATED;

          const StatusIcon = status.icon;

          return (
            <div
              key={order.id}
              className="grid grid-cols-2 items-center gap-3 px-6 py-5 transition-colors hover:bg-line/10 md:grid-cols-12 md:gap-4"
            >
              <div className="md:col-span-2">
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-soft md:hidden">
                  Заказ
                </div>

                <div className="font-mono font-semibold text-ink">
                  {order.number ?? order.id.slice(0, 8)}
                </div>

                <div className="text-xs text-ink-soft">
                  {order.items?.length ?? 0} товар.
                </div>
              </div>

              <div className="text-sm text-ink-soft md:col-span-2">
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] md:hidden">
                  Дата
                </div>
                {formatDate(order.createdAt, locale)}
              </div>

              <div className="col-span-2 text-sm md:col-span-4">
                <div className="mb-1 text-[10px] uppercase tracking-[0.2em] text-ink-soft md:hidden">
                  Проект
                </div>

                {order.roomProject ? (
                  <span className="inline-flex items-center gap-2 text-ink">
                    <Package className="size-3.5 text-brand" />
                    {order.roomProject.title}
                  </span>
                ) : (
                  <span className="text-line">— из каталога</span>
                )}
              </div>

              <div className="md:col-span-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-xs font-medium',
                    status.className,
                  )}
                >
                  <StatusIcon size={12} />
                  {status.label}
                </span>
              </div>

              <div className="font-semibold text-ink md:col-span-2 md:text-right">
                {formatMoney(order.totalAmount)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
