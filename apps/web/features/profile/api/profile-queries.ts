'use client';

import { useQuery } from '@tanstack/react-query';
import { getProfileSummary } from './profile-api';

export const profileQueryKeys = {
  summary: ['profile', 'summary'] as const,
};

export function useProfileSummaryQuery() {
  return useQuery({
    queryKey: profileQueryKeys.summary,
    queryFn: getProfileSummary,
  });
}
