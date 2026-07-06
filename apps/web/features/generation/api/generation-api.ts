import { apiFetch } from '@/shared/api/api-client';
import type {
  GenerationJob,
  GuestSessionResponse,
  InteriorStyle,
  RoomProject,
  RoomType,
  UploadedFile,
} from '@/shared/api/types';

export type CreateGenerationInput = {
  roomType: RoomType;
  style: InteriorStyle;
  title: string;
  budgetMax: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  sourceImageUrl?: string;
};

export type CreateGenerationResponse = {
  project: RoomProject;
  job: GenerationJob;
};

export function ensureGuestSession() {
  return apiFetch<GuestSessionResponse>('/guest/session');
}

export function uploadRoomImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return apiFetch<{ file: UploadedFile }>('/files/upload', {
    method: 'POST',
    body: formData,
  });
}

export function createGeneration(input: CreateGenerationInput) {
  return apiFetch<CreateGenerationResponse>('/generations', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getGenerationJob(jobId: string) {
  return apiFetch<GenerationJob>(`/generations/jobs/${jobId}`, {
    cache: 'no-store',
  });
}
