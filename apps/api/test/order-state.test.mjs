import assert from 'node:assert/strict';
import test from 'node:test';
import { ConflictException } from '@nestjs/common';

const {
  assertOrderCanBeCancelled,
  assertOrderStatusTransition,
  assertPaymentStatusTransition,
  assertProcurementStatusTransition,
  deriveFulfillmentStatus,
} = await import('../dist/modules/orders/order-state.js');

function assertAllowed(assertTransition, current, next) {
  assert.doesNotThrow(() => assertTransition(current, next));
}

function assertRejected(assertTransition, current, next) {
  assert.throws(
    () => assertTransition(current, next),
    (error) => error instanceof ConflictException,
  );
}

test('order transitions allow the approved paths and idempotent updates', () => {
  const allowed = {
    PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PROCESSING', 'CANCELLED'],
    PROCESSING: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  for (const [current, nextStatuses] of Object.entries(allowed)) {
    assertAllowed(assertOrderStatusTransition, current, current);

    for (const next of nextStatuses) {
      assertAllowed(assertOrderStatusTransition, current, next);
    }
  }

  assertRejected(assertOrderStatusTransition, 'PENDING_PAYMENT', 'PROCESSING');
  assertRejected(assertOrderStatusTransition, 'COMPLETED', 'CANCELLED');
  assertRejected(assertOrderStatusTransition, 'CANCELLED', 'PENDING_PAYMENT');
});

test('payment transitions include legacy cancellation and reject terminal changes', () => {
  const allowed = {
    NOT_REQUIRED: ['CANCELLED'],
    PENDING: ['PAID', 'FAILED', 'CANCELLED'],
    FAILED: ['PENDING', 'CANCELLED'],
    PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
    CANCELLED: [],
    REFUNDED: [],
    PARTIALLY_REFUNDED: [],
  };

  for (const [current, nextStatuses] of Object.entries(allowed)) {
    assertAllowed(assertPaymentStatusTransition, current, current);

    for (const next of nextStatuses) {
      assertAllowed(assertPaymentStatusTransition, current, next);
    }
  }

  assertRejected(assertPaymentStatusTransition, 'NOT_REQUIRED', 'PAID');
  assertRejected(assertPaymentStatusTransition, 'PENDING', 'REFUNDED');
  assertRejected(assertPaymentStatusTransition, 'REFUNDED', 'PENDING');
});

test('procurement transitions allow the approved operational paths', () => {
  const allowed = {
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

  for (const [current, nextStatuses] of Object.entries(allowed)) {
    assertAllowed(assertProcurementStatusTransition, current, current);

    for (const next of nextStatuses) {
      assertAllowed(assertProcurementStatusTransition, current, next);
    }
  }

  assertRejected(
    assertProcurementStatusTransition,
    'NOT_STARTED',
    'DELIVERED',
  );
  assertRejected(assertProcurementStatusTransition, 'SHIPPED', 'CANCELLED');
  assertRejected(assertProcurementStatusTransition, 'DELIVERED', 'SHIPPED');
});

test('fulfillment status is derived from all item procurement statuses', () => {
  const cases = [
    [[], 'NOT_STARTED'],
    [['NOT_STARTED', 'NOT_STARTED'], 'NOT_STARTED'],
    [['DELIVERED', 'DELIVERED'], 'DELIVERED'],
    [['SHIPPED', 'DELIVERED'], 'SHIPPED'],
    [['CONFIRMED_BY_SUPPLIER', 'DELIVERED'], 'PROCURED'],
    [['CONFIRMED_BY_SUPPLIER', 'NOT_STARTED'], 'PARTIALLY_PROCURED'],
    [['SHIPPED', 'ORDERED'], 'PARTIALLY_PROCURED'],
    [['NOT_STARTED', 'ORDERED'], 'PROCUREMENT'],
    [['UNAVAILABLE', 'REPLACEMENT_REQUIRED'], 'PROCUREMENT'],
  ];

  for (const [statuses, expected] of cases) {
    assert.equal(deriveFulfillmentStatus(statuses), expected);
  }
});

test('cancellation requires an unpaid order with untouched fulfillment', () => {
  for (const paymentStatus of [
    'NOT_REQUIRED',
    'PENDING',
    'FAILED',
    'CANCELLED',
  ]) {
    assert.doesNotThrow(() =>
      assertOrderCanBeCancelled(paymentStatus, 'NOT_STARTED'),
    );
  }

  for (const paymentStatus of [
    'PAID',
    'REFUNDED',
    'PARTIALLY_REFUNDED',
  ]) {
    assert.throws(
      () => assertOrderCanBeCancelled(paymentStatus, 'NOT_STARTED'),
      (error) => error instanceof ConflictException,
    );
  }

  assert.throws(
    () => assertOrderCanBeCancelled('PENDING', 'PROCUREMENT'),
    (error) => error instanceof ConflictException,
  );
});
