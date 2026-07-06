import type { InteriorStyle, RoomType } from '@/shared/api/types';

export type CreateProjectFormState = {
  roomType: RoomType | null;
  width: string | null;
  depth: string | null;
  height: string | null;
  style: InteriorStyle | null;
  budgetMax: number;
  sourceImageFile: File | null;
};

export type ProjectBriefItem = {
  label: string;
  value: string;
};
