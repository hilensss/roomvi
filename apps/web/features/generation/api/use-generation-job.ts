'use client';

import { useQuery } from '@tanstack/react-query';
import { getGenerationJob } from './generation-api';

const ACTIVE_GENERATION_STATUSES = ['PENDING', 'PROCESSING'] as const;

function isActiveGenerationStatus(status?: string) {
  return status
    ? ACTIVE_GENERATION_STATUSES.includes(
        status as (typeof ACTIVE_GENERATION_STATUSES)[number],
      )
    : true;
}

export function useGenerationJob(jobId?: string) {
  return useQuery({
    queryKey: ['generation-job', jobId],
    queryFn: () => {
      if (!jobId) {
        throw new Error('Generation job id is required');
      }

      return getGenerationJob(jobId);
    },
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const job = query.state.data;

      if (!job) return 2000;

      return isActiveGenerationStatus(job.status) ? 2000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: (failureCount, error) => {
      if (failureCount >= 3) return false;

      const message = error instanceof Error ? error.message : '';

      if (message.includes('404')) return false;
      if (message.includes('403')) return false;

      return true;
    },
  });
}
