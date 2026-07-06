import { apiFetch } from '@/shared/api/api-client';
import type { AuthUser, RoomProject, Order } from '@/shared/api/types';

export type ProfileSummaryResponse = {
  user: AuthUser;
  projects: RoomProject[];
  orders: Order[];
};

export function getProfileSummary() {
  return apiFetch<ProfileSummaryResponse>('/profile/summary');
}
