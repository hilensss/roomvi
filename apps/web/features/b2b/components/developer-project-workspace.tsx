'use client';

import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useStartB2BFloorPlanAnalysisMutation } from '../api/b2b-queries';
import type { DeveloperB2BProject } from '../model/b2b.types';
import { FloorPlanRoomReview } from './floor-plan-room-review';

const statusLabels = {
  DRAFT: 'Черновик',
  ANALYZING: 'Распознавание',
  REVIEW_REQUIRED: 'Нужна проверка',
  READY_TO_GENERATE: 'Комнаты подтверждены',
  GENERATING: 'Генерация',
  PARTIALLY_COMPLETED: 'Готово частично',
  COMPLETED: 'Готово',
  FAILED: 'Ошибка',
} as const;

export function DeveloperProjectWorkspace({
  project,
}: {
  project: DeveloperB2BProject;
}) {
  const startAnalysis = useStartB2BFloorPlanAnalysisMutation();
  const [error, setError] = useState<string | null>(null);
  const latestAnalysis = project.analysisRuns[0];

  async function retryAnalysis() {
    setError(null);
    try {
      await startAnalysis.mutateAsync(project.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось запустить распознавание',
      );
    }
  }

  return (
    <div className="rv-container-wide py-10">
      <Link
        href="/manager/projects"
        className="text-sm text-ink-soft transition hover:text-brand"
      >
        ← Все B2B-проекты
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="rv-eyebrow mb-2">Проект застройщика</p>
          <h1 className="text-section-title text-ink">{project.name}</h1>
          <p className="mt-2 text-ink-soft">{project.partnerName}</p>
        </div>
        <span className="w-fit rounded-pill bg-brand-soft px-4 py-2 text-sm font-medium text-brand">
          {statusLabels[project.status]}
        </span>
      </div>

      <section className="mt-8 grid gap-4 rounded-card border border-line/50 bg-white p-5 text-sm md:grid-cols-3 md:p-6">
        <Meta label="Стиль проекта" value={project.style} />
        <Meta
          label="Потолок по умолчанию"
          value={`${project.defaultCeilingHeightCm} см`}
        />
        <Meta
          label="Комнат распознано"
          value={String(project.rooms.length)}
        />
        {project.managerComment ? (
          <Meta
            label="Комментарий"
            value={project.managerComment}
            className="md:col-span-3"
          />
        ) : null}
      </section>

      {project.status === 'ANALYZING' ? (
        <section className="mt-6 rounded-card bg-dark p-6 text-white">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-3 font-medium">
              <LoaderCircle className="size-5 animate-spin text-brand" />
              {latestAnalysis?.currentStep ??
                'Распознаём комнаты, размеры, окна и двери'}
            </span>
            <span>{latestAnalysis?.progress ?? 0}%</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-pill bg-white/15">
            <div
              className="h-full rounded-pill bg-brand transition-all"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(latestAnalysis?.progress ?? 0, 100),
                )}%`,
              }}
            />
          </div>
          <p className="mt-3 text-xs text-white/60">
            Обычно анализ требует одного недорогого вызова reasoning-модели.
          </p>
        </section>
      ) : null}

      {project.status === 'FAILED' || project.status === 'DRAFT' ? (
        <section className="mt-6 rounded-card border border-brand/30 bg-brand-soft p-5">
          <p className="text-sm text-brand">
            {latestAnalysis?.errorMessage ??
              'Планировка ещё не распознана.'}
          </p>
          <button
            type="button"
            onClick={retryAnalysis}
            disabled={startAnalysis.isPending}
            className="mt-4 rounded-pill bg-dark px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {startAnalysis.isPending
              ? 'Запускаем...'
              : 'Запустить распознавание'}
          </button>
        </section>
      ) : null}

      {project.status === 'REVIEW_REQUIRED' && project.rooms.length > 0 ? (
        <FloorPlanRoomReview project={project} />
      ) : null}

      {project.status === 'READY_TO_GENERATE' ? (
        <section className="mt-8 rounded-card border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
          Комнаты подтверждены. Следующий шаг — двухэтапная генерация пустой
          геометрии и меблировки для каждой комнаты.
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-brand">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Meta({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="block text-xs uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <span className="mt-1 block font-medium text-ink">{value}</span>
    </div>
  );
}
