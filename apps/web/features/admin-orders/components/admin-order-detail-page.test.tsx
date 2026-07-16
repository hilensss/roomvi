import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithQueryClient, screen } from '@/test/render';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  orderComment: vi.fn(),
  procurement: vi.fn(),
  itemComment: vi.fn(),
}));

const order = {
  id: 'order-1', number: 1042, userId: 'user-1', guestSessionId: null,
  cartId: 'cart-1', status: 'CONFIRMED', paymentStatus: 'PENDING',
  fulfillmentStatus: 'NOT_STARTED', subtotalAmount: 24000, deliveryAmount: 0,
  totalAmount: 24000, currency: 'RUB', customerName: 'Анна Иванова',
  customerEmail: 'anna@example.com', customerPhone: '+79991234567',
  deliveryCity: 'Москва', deliveryAddress: 'Тверская, 10',
  deliveryPostalCode: null, deliveryComment: null, deliveryDate: null,
  customerComment: 'Позвонить заранее', managerComment: null, paidAt: null,
  cancelledAt: null, completedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  user: { id: 'user-1', email: 'anna@example.com', name: 'Анна', phone: '+7999' },
  payment: {
    id: 'payment-1', provider: 'MANUAL', status: 'PENDING',
    externalPaymentId: null, paymentUrl: null, amount: 24000, currency: 'RUB',
    failureCode: null, failureMessage: null, paidAt: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  items: [{
    id: 'item-1', orderId: 'order-1', productId: 'product-1',
    supplierId: 'supplier-1', externalProductId: 'SKU-42', source: 'CATALOG',
    roomProjectId: null, designVariantId: null, quantity: 2,
    priceSnapshot: 12000, totalPrice: 24000, titleSnapshot: 'Кресло Луна',
    imageSnapshot: null, availabilitySnapshot: 'IN_STOCK',
    supplierNameSnapshot: 'Мебель-Плюс', productUrlSnapshot: 'https://example.com/chair',
    procurementStatus: 'NOT_STARTED', managerComment: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }],
  supplierOrders: [{
    id: 'supplier-order-1', orderId: 'order-1', supplierId: 'supplier-1',
    status: 'PENDING', externalOrderId: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    supplier: { id: 'supplier-1', name: 'Мебель-Плюс' },
  }],
};

vi.mock('../api/admin-orders-queries', () => ({
  useAdminOrderQuery: () => ({ data: order, isLoading: false, isError: false }),
  useUpdateAdminOrderStatusMutation: () => ({ mutateAsync: mocks.status, isPending: false }),
  useUpdateAdminOrderCommentMutation: () => ({ mutateAsync: mocks.orderComment, isPending: false }),
  useUpdateAdminItemProcurementMutation: () => ({ mutateAsync: mocks.procurement, isPending: false }),
  useUpdateAdminItemCommentMutation: () => ({ mutateAsync: mocks.itemComment, isPending: false }),
}));

import { AdminOrderDetailPage } from './admin-order-detail-page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.status.mockResolvedValue(order);
  mocks.orderComment.mockResolvedValue(order);
  mocks.procurement.mockResolvedValue(order);
  mocks.itemComment.mockResolvedValue(order);
});

it('offers only valid transitions and saves procurement and comments', async () => {
  const user = userEvent.setup();
  renderWithQueryClient(<AdminOrderDetailPage orderId="order-1" />);

  const statusSelect = screen.getByLabelText('Статус заказа');
  expect(statusSelect).toHaveDisplayValue('Подтверждён');
  expect(screen.queryByRole('option', { name: 'Завершён' })).not.toBeInTheDocument();
  await user.selectOptions(statusSelect, 'PROCESSING');
  expect(mocks.status).toHaveBeenCalledWith({ orderId: 'order-1', status: 'PROCESSING' });

  await user.selectOptions(screen.getByLabelText('Закупка: Кресло Луна'), 'ORDERED');
  expect(mocks.procurement).toHaveBeenCalledWith({
    orderId: 'order-1', itemId: 'item-1', procurementStatus: 'ORDERED',
  });

  await user.type(screen.getByLabelText('Комментарий менеджера к заказу'), 'Уточнить подъезд');
  await user.click(screen.getByRole('button', { name: 'Сохранить комментарий к заказу' }));
  expect(mocks.orderComment).toHaveBeenCalledWith({
    orderId: 'order-1', managerComment: 'Уточнить подъезд',
  });
});
