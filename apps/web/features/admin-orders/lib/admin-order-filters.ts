import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '@/features/orders/model/order.types';
import type { AdminOrderFilters } from '../model/admin-order.types';

const orderStatuses: readonly OrderStatus[] = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
];
const paymentStatuses: readonly PaymentStatus[] = [
  'NOT_REQUIRED',
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];
const fulfillmentStatuses: readonly FulfillmentStatus[] = [
  'NOT_STARTED',
  'PROCUREMENT',
  'PARTIALLY_PROCURED',
  'PROCURED',
  'SHIPPED',
  'DELIVERED',
];

function approvedValue<T extends string>(
  value: string | null,
  values: readonly T[],
) {
  return value && values.includes(value as T) ? (value as T) : undefined;
}

function positiveInteger(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= 2_147_483_647 ? value : undefined;
}

function trimmed(value: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function localDateInput(value: string | null) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseAdminOrderFilters(
  params: URLSearchParams,
): AdminOrderFilters {
  const rawLimit = Number(params.get('limit'));
  const limit = ([20, 50, 100] as const).includes(
    rawLimit as 20 | 50 | 100,
  )
    ? (rawLimit as 20 | 50 | 100)
    : 20;
  const rawOffset = Number(params.get('offset'));
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

  const status = approvedValue(params.get('status'), orderStatuses);
  const paymentStatus = approvedValue(
    params.get('paymentStatus'),
    paymentStatuses,
  );
  const fulfillmentStatus = approvedValue(
    params.get('fulfillmentStatus'),
    fulfillmentStatuses,
  );
  const number = positiveInteger(params.get('number'));
  const customerEmail = trimmed(params.get('customerEmail'));
  const customerPhone = trimmed(params.get('customerPhone'));
  const createdFrom = localDateInput(params.get('createdFrom'));
  const createdTo = localDateInput(params.get('createdTo'));
  const search = trimmed(params.get('search'));

  return {
    limit,
    offset,
    ...(status ? { status } : {}),
    ...(paymentStatus ? { paymentStatus } : {}),
    ...(fulfillmentStatus ? { fulfillmentStatus } : {}),
    ...(number ? { number } : {}),
    ...(customerEmail ? { customerEmail } : {}),
    ...(customerPhone ? { customerPhone } : {}),
    ...(createdFrom ? { createdFrom } : {}),
    ...(createdTo ? { createdTo } : {}),
    ...(search ? { search } : {}),
  };
}

function appendTrimmed(
  params: URLSearchParams,
  name: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(name, normalized);
}

export function buildAdminOrdersSearchParams(filters: AdminOrderFilters) {
  const params = new URLSearchParams({
    limit: String(filters.limit),
    offset: String(filters.offset),
  });

  if (filters.status) params.set('status', filters.status);
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus);
  if (filters.fulfillmentStatus) {
    params.set('fulfillmentStatus', filters.fulfillmentStatus);
  }
  appendTrimmed(params, 'number', filters.number);
  appendTrimmed(params, 'customerEmail', filters.customerEmail);
  appendTrimmed(params, 'customerPhone', filters.customerPhone);
  appendTrimmed(params, 'search', filters.search);

  if (filters.createdFrom) {
    const [year, month, day] = filters.createdFrom.split('-').map(Number);
    params.set(
      'createdFrom',
      new Date(year, month - 1, day, 0, 0, 0, 0).toISOString(),
    );
  }
  if (filters.createdTo) {
    const [year, month, day] = filters.createdTo.split('-').map(Number);
    params.set(
      'createdTo',
      new Date(year, month - 1, day, 23, 59, 59, 999).toISOString(),
    );
  }

  return params;
}
