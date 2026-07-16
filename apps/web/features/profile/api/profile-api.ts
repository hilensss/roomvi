import { apiFetch } from '@/shared/api/api-client';
import type { AuthUser, RoomProject } from '@/shared/api/types';
import type {
  FulfillmentStatus,
  OrderStatus,
  PaymentStatus,
} from '@/features/orders/model/order.types';

export type ProfileOrderSummary = {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type ProfileSummaryResponse = {
  user: AuthUser;
  projects: RoomProject[];
  orders: ProfileOrderSummary[];
};

export function getProfileSummary() {
  return apiFetch<ProfileSummaryResponse>('/profile/summary');
}
