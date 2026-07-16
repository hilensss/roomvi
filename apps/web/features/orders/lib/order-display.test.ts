import { describe, expect, it } from 'vitest';
import {
  fulfillmentStatusMeta,
  orderStatusMeta,
  paymentStatusMeta,
  procurementStatusMeta,
} from './order-display';

describe('order status presentation', () => {
  it('provides Russian labels for every public status', () => {
    expect(Object.keys(orderStatusMeta)).toHaveLength(5);
    expect(Object.keys(paymentStatusMeta)).toHaveLength(7);
    expect(Object.keys(fulfillmentStatusMeta)).toHaveLength(6);
    expect(Object.keys(procurementStatusMeta)).toHaveLength(8);
    expect(orderStatusMeta.PENDING_PAYMENT.label).toBe('Ожидает подтверждения');
    expect(paymentStatusMeta.PARTIALLY_REFUNDED.label).toBe(
      'Частично возвращён',
    );
    expect(fulfillmentStatusMeta.PARTIALLY_PROCURED.label).toBe(
      'Частично закуплен',
    );
    expect(procurementStatusMeta.REPLACEMENT_REQUIRED.label).toBe(
      'Нужна замена',
    );
  });
});
