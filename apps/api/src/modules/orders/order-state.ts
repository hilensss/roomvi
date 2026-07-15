import { ConflictException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderItemProcurementStatus,
  OrderStatus,
  PaymentStatus,
} from '@roomvi/database';

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.CONFIRMED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

const paymentTransitions: Record<PaymentStatus, readonly PaymentStatus[]> = {
  [PaymentStatus.NOT_REQUIRED]: [PaymentStatus.CANCELLED],
  [PaymentStatus.PENDING]: [
    PaymentStatus.PAID,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.FAILED]: [PaymentStatus.PENDING, PaymentStatus.CANCELLED],
  [PaymentStatus.PAID]: [
    PaymentStatus.REFUNDED,
    PaymentStatus.PARTIALLY_REFUNDED,
  ],
  [PaymentStatus.CANCELLED]: [],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.PARTIALLY_REFUNDED]: [],
};

const procurementTransitions: Record<
  OrderItemProcurementStatus,
  readonly OrderItemProcurementStatus[]
> = {
  [OrderItemProcurementStatus.NOT_STARTED]: [
    OrderItemProcurementStatus.ORDERED,
    OrderItemProcurementStatus.UNAVAILABLE,
    OrderItemProcurementStatus.CANCELLED,
  ],
  [OrderItemProcurementStatus.ORDERED]: [
    OrderItemProcurementStatus.CONFIRMED_BY_SUPPLIER,
    OrderItemProcurementStatus.UNAVAILABLE,
    OrderItemProcurementStatus.REPLACEMENT_REQUIRED,
    OrderItemProcurementStatus.CANCELLED,
  ],
  [OrderItemProcurementStatus.UNAVAILABLE]: [
    OrderItemProcurementStatus.REPLACEMENT_REQUIRED,
    OrderItemProcurementStatus.CANCELLED,
  ],
  [OrderItemProcurementStatus.REPLACEMENT_REQUIRED]: [
    OrderItemProcurementStatus.ORDERED,
    OrderItemProcurementStatus.CANCELLED,
  ],
  [OrderItemProcurementStatus.CONFIRMED_BY_SUPPLIER]: [
    OrderItemProcurementStatus.SHIPPED,
    OrderItemProcurementStatus.REPLACEMENT_REQUIRED,
    OrderItemProcurementStatus.CANCELLED,
  ],
  [OrderItemProcurementStatus.SHIPPED]: [
    OrderItemProcurementStatus.DELIVERED,
  ],
  [OrderItemProcurementStatus.DELIVERED]: [],
  [OrderItemProcurementStatus.CANCELLED]: [],
};

const procuredItemStatuses = new Set<OrderItemProcurementStatus>([
  OrderItemProcurementStatus.CONFIRMED_BY_SUPPLIER,
  OrderItemProcurementStatus.SHIPPED,
  OrderItemProcurementStatus.DELIVERED,
]);

const cancellationBlockedPaymentStatuses = new Set<PaymentStatus>([
  PaymentStatus.PAID,
  PaymentStatus.REFUNDED,
  PaymentStatus.PARTIALLY_REFUNDED,
]);

function assertTransition<T extends string>(
  current: T,
  next: T,
  transitions: Record<T, readonly T[]>,
  stateName: string,
): void {
  if (current === next) {
    return;
  }

  if (!transitions[current].includes(next)) {
    throw new ConflictException(
      `Invalid ${stateName} transition from ${current} to ${next}`,
    );
  }
}

export function assertOrderStatusTransition(
  current: OrderStatus,
  next: OrderStatus,
): void {
  assertTransition(current, next, orderTransitions, 'order status');
}

export function assertPaymentStatusTransition(
  current: PaymentStatus,
  next: PaymentStatus,
): void {
  assertTransition(current, next, paymentTransitions, 'payment status');
}

export function assertProcurementStatusTransition(
  current: OrderItemProcurementStatus,
  next: OrderItemProcurementStatus,
): void {
  assertTransition(current, next, procurementTransitions, 'procurement status');
}

export function deriveFulfillmentStatus(
  statuses: readonly OrderItemProcurementStatus[],
): FulfillmentStatus {
  if (
    statuses.length === 0 ||
    statuses.every((status) => status === OrderItemProcurementStatus.NOT_STARTED)
  ) {
    return FulfillmentStatus.NOT_STARTED;
  }

  if (
    statuses.every((status) => status === OrderItemProcurementStatus.DELIVERED)
  ) {
    return FulfillmentStatus.DELIVERED;
  }

  if (
    statuses.some((status) => status === OrderItemProcurementStatus.SHIPPED) &&
    statuses.every(
      (status) =>
        status === OrderItemProcurementStatus.SHIPPED ||
        status === OrderItemProcurementStatus.DELIVERED,
    )
  ) {
    return FulfillmentStatus.SHIPPED;
  }

  if (statuses.every((status) => procuredItemStatuses.has(status))) {
    return FulfillmentStatus.PROCURED;
  }

  if (statuses.some((status) => procuredItemStatuses.has(status))) {
    return FulfillmentStatus.PARTIALLY_PROCURED;
  }

  return FulfillmentStatus.PROCUREMENT;
}

export function assertOrderCanBeCancelled(
  paymentStatus: PaymentStatus,
  fulfillmentStatus: FulfillmentStatus,
): void {
  if (
    cancellationBlockedPaymentStatuses.has(paymentStatus) ||
    fulfillmentStatus !== FulfillmentStatus.NOT_STARTED
  ) {
    throw new ConflictException(
      'Order cannot be cancelled after payment or fulfillment has started',
    );
  }
}
