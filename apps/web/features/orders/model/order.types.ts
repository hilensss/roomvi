import type { CartItemSource, StockStatus } from '@/shared/api/types';

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type PaymentProvider = 'MANUAL' | 'ALFABANK';

export type FulfillmentStatus =
  | 'NOT_STARTED'
  | 'PROCUREMENT'
  | 'PARTIALLY_PROCURED'
  | 'PROCURED'
  | 'SHIPPED'
  | 'DELIVERED';

export type OrderItemProcurementStatus =
  | 'NOT_STARTED'
  | 'ORDERED'
  | 'CONFIRMED_BY_SUPPLIER'
  | 'UNAVAILABLE'
  | 'REPLACEMENT_REQUIRED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type PaymentSummary = {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number;
  currency: string;
  paymentUrl: string | null;
  paidAt: string | null;
};

export type PublicOrderItem = {
  id: string;
  productId: string | null;
  supplierId: string;
  source: CartItemSource;
  roomProjectId: string | null;
  designVariantId: string | null;
  quantity: number;
  priceSnapshot: number;
  totalPrice: number;
  titleSnapshot: string;
  imageSnapshot: string | null;
  availabilitySnapshot: StockStatus;
  procurementStatus: OrderItemProcurementStatus;
  createdAt: string;
  updatedAt: string;
};

type OrderSummaryFields = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  subtotalAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  currency: string;
  paidAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: PublicOrderItem[];
  payment: PaymentSummary | null;
};

export type OrderSummary = OrderSummaryFields & {
  itemCount: number;
};

export type OrderDetail = OrderSummaryFields & {
  cartId: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  deliveryCity: string | null;
  deliveryAddress: string;
  deliveryPostalCode: string | null;
  deliveryComment: string | null;
  customerComment: string | null;
};

export type OrdersListResponse = {
  items: OrderSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateOrderInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryCity: string;
  deliveryAddress: string;
  deliveryPostalCode?: string;
  deliveryComment?: string;
  customerComment?: string;
};
