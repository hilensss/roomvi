import { describe, expect, it } from 'vitest';
import {
  canCustomerCancel,
  getNextOrderStatuses,
  getNextProcurementStatuses,
} from './order-state-ui';

describe('order UI transitions', () => {
  it('mirrors the server order transition map', () => {
    expect(getNextOrderStatuses('PENDING_PAYMENT')).toEqual([
      'CONFIRMED',
      'CANCELLED',
    ]);
    expect(getNextOrderStatuses('CONFIRMED')).toEqual([
      'PROCESSING',
      'CANCELLED',
    ]);
    expect(getNextOrderStatuses('PROCESSING')).toEqual([
      'COMPLETED',
      'CANCELLED',
    ]);
    expect(getNextOrderStatuses('COMPLETED')).toEqual([]);
    expect(getNextOrderStatuses('CANCELLED')).toEqual([]);
  });

  it('mirrors every server procurement transition', () => {
    expect(getNextProcurementStatuses('NOT_STARTED')).toEqual([
      'ORDERED',
      'UNAVAILABLE',
      'CANCELLED',
    ]);
    expect(getNextProcurementStatuses('ORDERED')).toEqual([
      'CONFIRMED_BY_SUPPLIER',
      'UNAVAILABLE',
      'REPLACEMENT_REQUIRED',
      'CANCELLED',
    ]);
    expect(getNextProcurementStatuses('UNAVAILABLE')).toEqual([
      'REPLACEMENT_REQUIRED',
      'CANCELLED',
    ]);
    expect(getNextProcurementStatuses('REPLACEMENT_REQUIRED')).toEqual([
      'ORDERED',
      'CANCELLED',
    ]);
    expect(getNextProcurementStatuses('CONFIRMED_BY_SUPPLIER')).toEqual([
      'SHIPPED',
      'REPLACEMENT_REQUIRED',
      'CANCELLED',
    ]);
    expect(getNextProcurementStatuses('SHIPPED')).toEqual(['DELIVERED']);
    expect(getNextProcurementStatuses('DELIVERED')).toEqual([]);
    expect(getNextProcurementStatuses('CANCELLED')).toEqual([]);
  });

  it('shows customer cancellation only when payment and fulfillment allow it', () => {
    expect(canCustomerCancel('CONFIRMED', 'PENDING', 'NOT_STARTED')).toBe(true);
    expect(canCustomerCancel('PROCESSING', 'PAID', 'NOT_STARTED')).toBe(false);
    expect(canCustomerCancel('PROCESSING', 'PENDING', 'PROCUREMENT')).toBe(
      false,
    );
    expect(canCustomerCancel('COMPLETED', 'PENDING', 'NOT_STARTED')).toBe(
      false,
    );
  });
});
