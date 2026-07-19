import { apiFetch, buildApiUrl } from '@/shared/api/api-client';
import type {
  B2BProject,
  B2BProjectCatalogResponse,
  B2BProjectsListResponse,
  B2BSupplier,
  CreateB2BProjectInput,
  StartB2BGenerationResponse,
} from '../model/b2b.types';

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

export function getB2BVariantDownloadUrl(
  projectId: string,
  variantId: string,
) {
  return buildApiUrl(
    `/manager/b2b-projects/${projectId}/variants/${variantId}/download`,
  );
}
