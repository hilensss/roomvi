'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GenerationProgressView } from './generation-progress-view';
import { GenerationErrorView } from './generation-error-view';
import { useGenerationJob } from '../api/use-generation-job';
import {
  isGenerationCompleted,
  isGenerationFailed,
} from '../lib/generation.helpers';

type GenerationPageProps = {
  jobId: string;
};

export function GenerationPage({ jobId }: GenerationPageProps) {
  const router = useRouter();

  const { data: job, isLoading, isError, error } = useGenerationJob(jobId);

  useEffect(() => {
    if (!isGenerationCompleted(job?.status)) return;

    router.replace(`/generation/${job.id}/result`);
  }, [job, router]);

  if (isError) {
    return (
      <GenerationErrorView
        title="Не удалось загрузить генерацию"
        message={
          error instanceof Error
            ? error.message
            : 'Попробуйте обновить страницу.'
        }
      />
    );
  }

  if (isGenerationFailed(job?.status)) {
    return (
      <GenerationErrorView
        title="Не удалось создать дизайн"
        message={job?.errorMessage ?? 'Попробуйте запустить генерацию ещё раз.'}
      />
    );
  }

  return <GenerationProgressView job={job} isLoading={isLoading} />;
}
