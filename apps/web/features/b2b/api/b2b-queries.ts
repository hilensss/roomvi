'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createB2BProject,
  getB2BProject,
  getB2BProjectCatalog,
  listB2BProjects,
  listB2BSuppliers,
  replaceB2BProjectProducts,
  startB2BProjectGeneration,
} from './b2b-api';

export const b2bQueryKeys = {
  all: ['manager', 'b2b-projects'] as const,
  lists: () => ['manager', 'b2b-projects', 'list'] as const,
  list: (params: string) =>
    ['manager', 'b2b-projects', 'list', params] as const,
  details: () => ['manager', 'b2b-projects', 'detail'] as const,
  detail: (projectId: string) =>
    ['manager', 'b2b-projects', 'detail', projectId] as const,
  suppliers: ['manager', 'b2b-projects', 'suppliers'] as const,
  catalog: (projectId: string, params: string) =>
    ['manager', 'b2b-projects', projectId, 'catalog', params] as const,
};

export function useB2BProjectsQuery(params: URLSearchParams) {
  const serialized = params.toString();
  return useQuery({
    queryKey: b2bQueryKeys.list(serialized),
    queryFn: () => listB2BProjects(new URLSearchParams(serialized)),
  });
}

export function useB2BSuppliersQuery() {
  return useQuery({
    queryKey: b2bQueryKeys.suppliers,
    queryFn: listB2BSuppliers,
  });
}

export function useB2BProjectQuery(projectId: string) {
  return useQuery({
    queryKey: b2bQueryKeys.detail(projectId),
    queryFn: () => getB2BProject(projectId),
    refetchInterval: (query) =>
      query.state.data?.status === 'GENERATING' ? 2_000 : false,
  });
}

export function useB2BProjectCatalogQuery(
  projectId: string,
  params: URLSearchParams,
) {
  const serialized = params.toString();
  return useQuery({
    queryKey: b2bQueryKeys.catalog(projectId, serialized),
    queryFn: () =>
      getB2BProjectCatalog(projectId, new URLSearchParams(serialized)),
  });
}

export function useCreateB2BProjectMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createB2BProject,
    onSuccess: async (project) => {
      queryClient.setQueryData(b2bQueryKeys.detail(project.id), project);
      await queryClient.invalidateQueries({ queryKey: b2bQueryKeys.lists() });
    },
  });
}

export function useReplaceB2BProjectProductsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      projectId,
      productIds,
    }: {
      projectId: string;
      productIds: string[];
    }) => replaceB2BProjectProducts(projectId, productIds),
    onSuccess: async (project) => {
      queryClient.setQueryData(b2bQueryKeys.detail(project.id), project);
      await queryClient.invalidateQueries({ queryKey: b2bQueryKeys.lists() });
    },
  });
}

export function useStartB2BProjectGenerationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: startB2BProjectGeneration,
    onSuccess: async (_result, projectId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: b2bQueryKeys.detail(projectId),
        }),
        queryClient.invalidateQueries({ queryKey: b2bQueryKeys.lists() }),
      ]);
    },
  });
}
