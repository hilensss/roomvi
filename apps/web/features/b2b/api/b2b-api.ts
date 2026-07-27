import { apiFetch, buildApiUrl } from '@/shared/api/api-client';
import type {
  B2BProject,
  B2BProjectCatalogResponse,
  B2BProjectsListResponse,
  B2BSupplier,
  CreateB2BProjectInput,
  ReplaceB2BRoomsInput,
  StartB2BGenerationResponse,
  B2BAnalysisRun,
} from '../model/b2b.types';
import type { UploadedFile } from '@/shared/api/types';

function withQuery(path: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function listB2BProjects(params = new URLSearchParams()) {
  return apiFetch<B2BProjectsListResponse>(
    withQuery('/manager/b2b-projects', params),
  );
}

export function listB2BSuppliers() {
  return apiFetch<B2BSupplier[]>('/manager/b2b-projects/suppliers');
}

export function createB2BProject(input: CreateB2BProjectInput) {
  return apiFetch<B2BProject>('/manager/b2b-projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function uploadB2BRoomImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return apiFetch<{ file: UploadedFile }>('/files/upload', {
    method: 'POST',
    body: formData,
  });
}

export function getB2BProject(projectId: string) {
  return apiFetch<B2BProject>(`/manager/b2b-projects/${projectId}`);
}

export function getB2BProjectCatalog(
  projectId: string,
  params = new URLSearchParams(),
) {
  return apiFetch<B2BProjectCatalogResponse>(
    withQuery(`/manager/b2b-projects/${projectId}/catalog`, params),
  );
}

export function replaceB2BProjectProducts(
  projectId: string,
  productIds: string[],
) {
  return apiFetch<B2BProject>(
    `/manager/b2b-projects/${projectId}/products`,
    {
      method: 'PUT',
      body: JSON.stringify({ productIds }),
    },
  );
}

export function startB2BProjectGeneration(projectId: string) {
  return apiFetch<StartB2BGenerationResponse>(
    `/manager/b2b-projects/${projectId}/generate`,
    { method: 'POST' },
  );
}

export function startB2BFloorPlanAnalysis(projectId: string) {
  return apiFetch<B2BAnalysisRun>(
    `/manager/b2b-projects/${projectId}/analyze-floor-plan`,
    { method: 'POST' },
  );
}

export function replaceB2BRooms(input: ReplaceB2BRoomsInput) {
  return apiFetch<B2BProject>(
    `/manager/b2b-projects/${input.projectId}/rooms`,
    {
      method: 'PUT',
      body: JSON.stringify({
        roomsRevision: input.roomsRevision,
        rooms: input.rooms,
      }),
    },
  );
}

export function confirmB2BRooms(
  projectId: string,
  roomsRevision: number,
) {
  return apiFetch<B2BProject>(
    `/manager/b2b-projects/${projectId}/rooms/confirm`,
    {
      method: 'POST',
      body: JSON.stringify({ roomsRevision }),
    },
  );
}

export function getB2BVariantDownloadUrl(
  projectId: string,
  variantId: string,
) {
  return buildApiUrl(
    `/manager/b2b-projects/${projectId}/variants/${variantId}/download`,
  );
}
