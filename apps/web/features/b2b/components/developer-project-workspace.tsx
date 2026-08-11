'use client';

import Link from 'next/link';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import {
  useStartB2BFloorPlanAnalysisMutation,
  useStartB2BProjectGenerationMutation,
} from '../api/b2b-queries';
import { getB2BVariantDownloadUrl } from '../api/b2b-api';
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
  const startGeneration = useStartB2BProjectGenerationMutation();
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

  async function generateRooms() {
    setError(null);
    try {
      await startGeneration.mutateAsync(project.id);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось запустить генерацию комнат',
      );
    }
  }

  const includedRooms = project.rooms.filter((room) => room.isIncluded);
  const generatedRooms = includedRooms.filter(
    (room) => room.status === 'GENERATED',
  ).length;
  const failedRooms = includedRooms.filter(
    (room) => room.status === 'FAILED',
  ).length;
  const activeRooms = includedRooms.filter(
    (room) => room.status === 'GENERATING',
  ).length;

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

      {latestAnalysis?.warnings?.length ? (
        <section className="mt-5 rounded-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="font-semibold">Что проверить вручную</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {latestAnalysis.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {project.status === 'DRAFT' ||
      (project.status === 'FAILED' && project.rooms.length === 0) ? (
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
          <p>
            Комнаты подтверждены. Для каждой комнаты система сначала создаст
            пустую геометрию, а затем подберёт товары и выполнит меблировку.
          </p>
          <button
            type="button"
            onClick={generateRooms}
            disabled={startGeneration.isPending}
            className="mt-4 rounded-pill bg-dark px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {startGeneration.isPending
              ? 'Запускаем...'
              : 'Запустить генерацию комнат'}
          </button>
        </section>
      ) : null}

      {['GENERATING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'FAILED'].includes(
        project.status,
      ) && project.rooms.length > 0 ? (
        <section className="mt-8">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="rv-eyebrow mb-2">Генерация по комнатам</p>
              <h2 className="text-2xl font-semibold text-ink">
                Готово {generatedRooms} из {includedRooms.length}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">
                Генерируется: {activeRooms} · Требует внимания: {failedRooms}
              </p>
            </div>
            {['FAILED', 'PARTIALLY_COMPLETED'].includes(project.status) &&
            failedRooms > 0 ? (
              <button
                type="button"
                onClick={generateRooms}
                disabled={startGeneration.isPending}
                className="rounded-pill bg-dark px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {startGeneration.isPending
                  ? 'Перезапускаем...'
                  : 'Повторить проблемные комнаты'}
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            {includedRooms.map((room) => {
              const job = room.roomProject?.generationJobs[0];
              const variant = job?.designVariants[0];
              return (
                <article
                  key={room.id}
                  className="overflow-hidden rounded-card border border-line/50 bg-white"
                >
                  {variant ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={variant.imageUrl}
                      alt={`Визуализация: ${room.name}`}
                      className="aspect-[16/10] w-full object-cover"
                    />
                  ) : null}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-ink">
                          {room.name}
                        </h3>
                        <p className="mt-1 text-xs text-ink-soft">
                          {job?.currentStep ?? roomStatusLabel(room.status)}
                        </p>
                      </div>
                      <span className="rounded-pill bg-line/20 px-3 py-1 text-xs text-ink-soft">
                        {job?.progress ?? 0}%
                      </span>
                    </div>

                    {job?.status === 'PROCESSING' ||
                    job?.status === 'PENDING' ? (
                      <div className="mt-4 h-2 overflow-hidden rounded-pill bg-line/30">
                        <div
                          className="h-full rounded-pill bg-brand transition-all"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    ) : null}

                    {job?.errorMessage ? (
                      <p className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                        {job.errorMessage}
                      </p>
                    ) : null}

                    {variant ? (
                      <>
                        <div className="mt-5 border-t border-line/40 pt-4">
                          <p className="text-sm font-semibold text-ink">
                            Подборка товаров
                          </p>
                          <ul className="mt-3 space-y-2 text-sm">
                            {variant.products.map(({ product }) => (
                              <li
                                key={product.id}
                                className="flex justify-between gap-3"
                              >
                                {product.productUrl ? (
                                  <a
                                    href={product.productUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-ink hover:text-brand"
                                  >
                                    {product.title}
                                  </a>
                                ) : (
                                  <span>{product.title}</span>
                                )}
                                <span className="shrink-0 text-ink-soft">
                                  {formatRubles(product.price)}
                                </span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-4 flex justify-between border-t border-line/40 pt-3 font-semibold text-ink">
                            <span>Итого</span>
                            <span>{formatRubles(variant.totalPrice ?? 0)}</span>
                          </p>
                        </div>
                        <a
                          href={getB2BVariantDownloadUrl(
                            project.id,
                            variant.id,
                          )}
                          className="mt-4 inline-flex rounded-pill border border-line/60 px-4 py-2 text-sm font-medium text-ink hover:border-brand hover:text-brand"
                        >
                          Скачать визуализацию
                        </a>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
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

function roomStatusLabel(status: DeveloperB2BProject['rooms'][number]['status']) {
  const labels = {
    DETECTED: 'Комната распознана',
    REVIEW_REQUIRED: 'Нужна проверка',
    READY_TO_GENERATE: 'Готова к генерации',
    GENERATING: 'Генерируем комнату',
    GENERATED: 'Готово',
    FAILED: 'Ошибка генерации',
    SKIPPED: 'Исключена',
  } as const;
  return labels[status];
}

function formatRubles(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
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
