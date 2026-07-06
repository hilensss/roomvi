import { GenerationJob, RoomProject } from '@/shared/api/types';

export function formatGenerationTime(seconds: number) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const restSeconds = String(seconds % 60).padStart(2, '0');

  return `${minutes}:${restSeconds}`;
}

export function formatProjectDimensions(project?: RoomProject) {
  if (!project?.widthCm || !project.depthCm || !project.heightCm) {
    return '—';
  }

  return `${project.widthCm / 100} × ${project.depthCm / 100} × ${
    project.heightCm / 100
  } м`;
}

export function formatMoney(value?: number | null) {
  if (!value) {
    return '—';
  }

  return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
}

export function isGenerationActive(status?: GenerationJob['status']) {
  return status === 'PENDING' || status === 'PROCESSING';
}

export function isGenerationCompleted(status?: GenerationJob['status']) {
  return status === 'COMPLETED';
}

export function isGenerationFailed(status?: GenerationJob['status']) {
  return status === 'FAILED';
}

export function getRealGenerationProgress(job?: GenerationJob) {
  if (!job) return 3;

  if (job.status === 'COMPLETED') return 100;

  if (job.status === 'FAILED') return 100;

  return Math.max(3, Math.min(99, job.progress ?? 3));
}

export function getGenerationStepIndex(progress: number) {
  if (progress >= 92) return 4;

  if (progress >= 18) return 3;

  if (progress >= 10) return 2;

  if (progress >= 8) return 1;

  return 0;
}

export function getGeneratedVariantsCount(job?: GenerationJob) {
  if (!job) return 0;

  if (job.status === 'COMPLETED') {
    return job.designVariants?.length ?? 4;
  }

  const step = job.currentStep ?? '';

  const match = step.match(/Вариант\s+(\d+)\/(\d+)/i);

  if (!match) return 0;

  const currentVariant = Number(match[1]);

  const normalizedStep = step.toLowerCase();

  const isCurrentVariantReady =
    normalizedStep.includes('готов') ||
    normalizedStep.includes('сохраняем варианты');

  return Math.max(0, currentVariant - (isCurrentVariantReady ? 0 : 1));
}

export function getCurrentVariantNumber(job?: GenerationJob) {
  const step = job?.currentStep ?? '';

  const match = step.match(/Вариант\s+(\d+)\/(\d+)/i);

  return match ? Number(match[1]) : undefined;
}

export function getTotalVariantsCount(job?: GenerationJob) {
  const step = job?.currentStep ?? '';

  const match = step.match(/Вариант\s+\d+\/(\d+)/i);

  if (match) return Number(match[1]);

  if (job?.status === 'COMPLETED' && job.designVariants?.length) {
    return job.designVariants.length;
  }

  return 4;
}

export function getGenerationStepTitle(job?: GenerationJob, fallback?: string) {
  const step = job?.currentStep;

  if (!step) return fallback ?? 'Готовим генерацию';

  return step

    .replace(/варианта 1/gi, 'варианта')

    .replace(/Вариант\s+(\d+)\/(\d+):\s*/i, 'Вариант $1/$2 · ');
}
