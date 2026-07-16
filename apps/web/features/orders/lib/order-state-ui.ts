import type {
  FulfillmentStatus,
  OrderItemProcurementStatus,
  OrderStatus,
  PaymentStatus,
} from '../model/order.types';

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const procurementTransitions: Record<
  OrderItemProcurementStatus,
  readonly OrderItemProcurementStatus[]
> = {
  NOT_STARTED: ['ORDERED', 'UNAVAILABLE', 'CANCELLED'],
  ORDERED: [
    'CONFIRMED_BY_SUPPLIER',
    'UNAVAILABLE',
    'REPLACEMENT_REQUIRED',
    'CANCELLED',
  ],
  UNAVAILABLE: ['REPLACEMENT_REQUIRED', 'CANCELLED'],
  REPLACEMENT_REQUIRED: ['ORDERED', 'CANCELLED'],
  CONFIRMED_BY_SUPPLIER: [
    'SHIPPED',
    'REPLACEMENT_REQUIRED',
    'CANCELLED',
  ],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const cancellationBlockedPaymentStatuses = new Set<PaymentStatus>([
  'PAID',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export function getNextOrderStatuses(status: OrderStatus) {
  return orderTransitions[status];
}

export function getNextProcurementStatuses(
  status: OrderItemProcurementStatus,
) {
  return procurementTransitions[status];
}

export function canCustomerCancel(
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
) {
  return (
    orderTransitions[status].includes('CANCELLED') &&
    !cancellationBlockedPaymentStatuses.has(paymentStatus) &&
    fulfillmentStatus === 'NOT_STARTED'
  );
}
