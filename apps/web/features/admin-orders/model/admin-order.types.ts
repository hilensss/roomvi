import type {
  FulfillmentStatus,
  OrderItemProcurementStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
} from '@/features/orders/model/order.types';
import type { CartItemSource, StockStatus } from '@/shared/api/types';

export type AdminPayment = {
  id: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  externalPaymentId: string | null;
  paymentUrl: string | null;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminOrderItem = {
  id: string;
  orderId: string;
  productId: string | null;
  supplierId: string;
  externalProductId: string;
  source: CartItemSource;
  roomProjectId: string | null;
  designVariantId: string | null;
  quantity: number;
  priceSnapshot: number;
  totalPrice: number;
  titleSnapshot: string;
  imageSnapshot: string | null;
  availabilitySnapshot: StockStatus;
  supplierNameSnapshot: string;
  productUrlSnapshot: string | null;
  procurementStatus: OrderItemProcurementStatus;
  managerComment: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSupplierOrder = {
  id: string;
  orderId: string;
  supplierId: string;
  status: string;
  externalOrderId: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: { id: string; name: string };
};

export type AdminOrder = {
  id: string;
  number: number;
  userId: string | null;
  guestSessionId: string | null;
  cartId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  subtotalAmount: number;
  deliveryAmount: number;
  totalAmount: number;
  currency: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  deliveryCity: string | null;
  deliveryAddress: string;
  deliveryPostalCode: string | null;
  deliveryComment: string | null;
  deliveryDate: string | null;
  customerComment: string | null;
  managerComment: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    phone: string | null;
  } | null;
  items: AdminOrderItem[];
  supplierOrders: AdminSupplierOrder[];
  payment: AdminPayment | null;
};

export type AdminOrdersListResponse = {
  items: AdminOrder[];
  total: number;
  limit: number;
  offset: number;
};

export type AdminOrderFilters = {
  limit: 20 | 50 | 100;
  offset: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  number?: string;
  customerEmail?: string;
  customerPhone?: string;
  createdFrom?: string;
  createdTo?: string;
  search?: string;
};
