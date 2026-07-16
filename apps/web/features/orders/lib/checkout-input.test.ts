import { describe, expect, it, vi } from 'vitest';
import {
  getOrCreateIdempotencyKey,
  sanitizeCheckoutValues,
  validateCheckoutValues,
} from './checkout-input';

const validValues = {
  customerName: '  Анна Иванова  ',
  customerEmail: '  anna@example.com ',
  customerPhone: ' +7 999 123-45-67 ',
  deliveryCity: ' Москва ',
  deliveryAddress: ' ул. Тверская, 10 ',
  deliveryPostalCode: '   ',
  deliveryComment: ' Позвонить заранее ',
  customerComment: '',
};

describe('checkout input', () => {
  it('trims approved fields and omits empty optional values', () => {
    expect(
      sanitizeCheckoutValues({
        ...validValues,
        totalAmount: 1,
        items: ['forged'],
      } as never),
    ).toEqual({
      customerName: 'Анна Иванова',
      customerEmail: 'anna@example.com',
      customerPhone: '+7 999 123-45-67',
      deliveryCity: 'Москва',
      deliveryAddress: 'ул. Тверская, 10',
      deliveryComment: 'Позвонить заранее',
    });
  });

  it('validates the same required fields and bounds as the API', () => {
    expect(validateCheckoutValues(validValues)).toEqual({});

    expect(
      validateCheckoutValues({
        ...validValues,
        customerName: ' A ',
        customerEmail: 'not-an-email',
        customerPhone: '1234',
        deliveryCity: ' X ',
        deliveryAddress: '1234',
        deliveryPostalCode: '1'.repeat(33),
        deliveryComment: '1'.repeat(1001),
        customerComment: '1'.repeat(1001),
      }),
    ).toEqual({
      customerName: 'Укажите имя длиной от 2 до 120 символов',
      customerEmail: 'Укажите корректный email длиной до 254 символов',
      customerPhone: 'Укажите телефон длиной от 5 до 32 символов',
      deliveryCity: 'Укажите город длиной от 2 до 120 символов',
      deliveryAddress: 'Укажите адрес длиной от 5 до 500 символов',
      deliveryPostalCode: 'Индекс должен быть не длиннее 32 символов',
      deliveryComment: 'Комментарий должен быть не длиннее 1000 символов',
      customerComment: 'Комментарий должен быть не длиннее 1000 символов',
    });
  });

  it('reuses the same idempotency key for retries', () => {
    const createKey = vi.fn(() => 'attempt-key');
    const first = getOrCreateIdempotencyKey(null, createKey);
    const retry = getOrCreateIdempotencyKey(first, createKey);

    expect(first).toBe('attempt-key');
    expect(retry).toBe('attempt-key');
    expect(createKey).toHaveBeenCalledTimes(1);
  });
});
