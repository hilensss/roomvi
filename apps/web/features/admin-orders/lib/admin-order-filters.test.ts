import { describe, expect, it } from 'vitest';
import {
  buildAdminOrdersSearchParams,
  parseAdminOrderFilters,
} from './admin-order-filters';

describe('admin order filters', () => {
  it('serializes approved filters, trims text, and expands date boundaries', () => {
    const params = buildAdminOrdersSearchParams({
      limit: 50,
      offset: 100,
      status: 'CONFIRMED',
      paymentStatus: 'PENDING',
      fulfillmentStatus: 'PROCUREMENT',
      number: '1042',
      customerEmail: ' anna@example.com ',
      customerPhone: ' +7999 ',
      createdFrom: '2026-01-01',
      createdTo: '2026-01-31',
      search: ' Анна ',
    });

    expect(params.get('limit')).toBe('50');
    expect(params.get('offset')).toBe('100');
    expect(params.get('status')).toBe('CONFIRMED');
    expect(params.get('paymentStatus')).toBe('PENDING');
    expect(params.get('fulfillmentStatus')).toBe('PROCUREMENT');
    expect(params.get('number')).toBe('1042');
    expect(params.get('customerEmail')).toBe('anna@example.com');
    expect(params.get('customerPhone')).toBe('+7999');
    expect(params.get('search')).toBe('Анна');
    expect(params.get('createdFrom')).toBe(
      new Date(2026, 0, 1, 0, 0, 0, 0).toISOString(),
    );
    expect(params.get('createdTo')).toBe(
      new Date(2026, 0, 31, 23, 59, 59, 999).toISOString(),
    );
  });

  it('parses safe defaults and ignores unsupported enum values', () => {
    const filters = parseAdminOrderFilters(
      new URLSearchParams(
        'limit=500&offset=-1&status=UNKNOWN&paymentStatus=PAID&search=',
      ),
    );

    expect(filters).toEqual({
      limit: 20,
      offset: 0,
      paymentStatus: 'PAID',
    });
  });
});
