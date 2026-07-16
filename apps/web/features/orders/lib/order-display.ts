import type {
  FulfillmentStatus,
  OrderItemProcurementStatus,
  OrderStatus,
  PaymentStatus,
} from '../model/order.types';

type StatusMeta = {
  label: string;
  className: string;
};

const neutral = 'bg-line/25 text-ink-soft';
const accent = 'bg-brand-soft text-brand';
const active = 'bg-dark/10 text-ink';
const danger = 'bg-red-50 text-red-700';
const success = 'bg-emerald-50 text-emerald-700';

export const orderStatusMeta = {
  PENDING_PAYMENT: { label: 'Ожидает подтверждения', className: accent },
  CONFIRMED: { label: 'Подтверждён', className: active },
  PROCESSING: { label: 'В работе', className: active },
  COMPLETED: { label: 'Завершён', className: success },
  CANCELLED: { label: 'Отменён', className: neutral },
} satisfies Record<OrderStatus, StatusMeta>;

export const paymentStatusMeta = {
  NOT_REQUIRED: { label: 'Не требуется', className: neutral },
  PENDING: { label: 'Ожидается', className: accent },
  PAID: { label: 'Оплачен', className: success },
  FAILED: { label: 'Ошибка оплаты', className: danger },
  CANCELLED: { label: 'Отменён', className: neutral },
  REFUNDED: { label: 'Возвращён', className: neutral },
  PARTIALLY_REFUNDED: {
    label: 'Частично возвращён',
    className: neutral,
  },
} satisfies Record<PaymentStatus, StatusMeta>;

export const fulfillmentStatusMeta = {
  NOT_STARTED: { label: 'Не начат', className: neutral },
  PROCUREMENT: { label: 'Закупается', className: accent },
  PARTIALLY_PROCURED: { label: 'Частично закуплен', className: accent },
  PROCURED: { label: 'Закуплен', className: active },
  SHIPPED: { label: 'Отправлен', className: active },
  DELIVERED: { label: 'Доставлен', className: success },
} satisfies Record<FulfillmentStatus, StatusMeta>;

export const procurementStatusMeta = {
  NOT_STARTED: { label: 'Не начато', className: neutral },
  ORDERED: { label: 'Заказано', className: accent },
  CONFIRMED_BY_SUPPLIER: { label: 'Подтверждено', className: active },
  UNAVAILABLE: { label: 'Нет в наличии', className: danger },
  REPLACEMENT_REQUIRED: { label: 'Нужна замена', className: danger },
  SHIPPED: { label: 'Отправлено', className: active },
  DELIVERED: { label: 'Доставлено', className: success },
  CANCELLED: { label: 'Отменено', className: neutral },
} satisfies Record<OrderItemProcurementStatus, StatusMeta>;

export function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
