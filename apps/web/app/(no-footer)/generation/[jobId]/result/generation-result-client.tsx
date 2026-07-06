'use client';

import { useGenerationJob } from '@/features/generation/api/use-generation-job';
import { GenerationErrorView } from '@/features/generation/components/generation-error-view';
import { GenerationResultsView } from '@/features/generation/components/generation-results-view';

type GenerationResultClientProps = {
  jobId: string;
};

export function GenerationResultClient({ jobId }: GenerationResultClientProps) {
  const { data: job, error, isLoading } = useGenerationJob(jobId);

  if (isLoading) {
    return null;
  }

  if (!job) {
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

  return <GenerationResultsView job={job} />;
}
