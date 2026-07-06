'use client';

import Image from 'next/image';
import { CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/shared/lib/cn';
import type { GenerationJob } from '@/shared/api/types';
import {
  GENERATION_PREVIEW_IMAGES,
  GENERATION_PROGRESS_STEPS,
} from '../model/generation-progress.data';
import {
  formatGenerationTime,
  formatMoney,
  formatProjectDimensions,
  getGeneratedVariantsCount,
  getGenerationStepIndex,
  getGenerationStepTitle,
  getRealGenerationProgress,
  getTotalVariantsCount,
} from '../lib/generation.helpers';

type GenerationProgressViewProps = {
  job?: GenerationJob;
  isLoading?: boolean;
};

export function GenerationProgressView({
  job,
  isLoading,
}: GenerationProgressViewProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);

  const progress = isLoading ? 3 : getRealGenerationProgress(job);
  const currentStepIndex = getGenerationStepIndex(progress);
  const currentStep = getGenerationStepTitle(
    job,
    GENERATION_PROGRESS_STEPS[currentStepIndex]?.title,
  );
  const generatedVariantsCount = getGeneratedVariantsCount(job);
  const totalVariantsCount = getTotalVariantsCount(job);

  useEffect(() => {
    const secondsTimer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
    }, 1000);

    const previewTimer = window.setInterval(() => {
      setPreviewIndex((index) => {
        return (index + 1) % GENERATION_PREVIEW_IMAGES.length;
      });
    }, 1400);

    return () => {
      window.clearInterval(secondsTimer);
      window.clearInterval(previewTimer);
    };
  }, []);

  const brief = useMemo(() => {
    const project = job?.roomProject;

    return [
      {
        label: 'Комната',
        value: project?.roomType ?? '—',
      },
      {
        label: 'Размеры',
        value: formatProjectDimensions(project),
      },
      {
        label: 'Стиль',
        value: project?.style ?? '—',
      },
      {
        label: 'Бюджет',
        value: formatMoney(project?.budgetMax),
      },
      {
        label: 'Фото',
        value: project?.sourceImageUrl ? 'Загружено' : 'Без фото',
      },
    ];
  }, [job]);

  return (
    <div className="min-h-full bg-white">
      <GenerationTopbar progress={progress} elapsedSeconds={elapsedSeconds} />

      <div className="rv-container-wide grid gap-12 py-12 lg:grid-cols-[380px_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-28 lg:self-start">
          <div className="overflow-hidden rounded-card bg-dark p-8 text-white">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles size={16} className="text-brand" />
              <span className="rv-eyebrow">Бриф</span>
            </div>

            <h2 className="mb-2 text-2xl font-semibold tracking-tight">
              AI работает над проектом
            </h2>

            <p className="mb-8 text-sm leading-6 text-line">
              Генерируем 4 фотореалистичных варианта на основе вашего брифа и
              товаров из каталога.
            </p>

            <div className="space-y-4">
              {brief.map((item) => (
                <div
                  key={item.label}
                  className="flex items-baseline justify-between gap-4 border-b border-white/10 pb-3 last:border-0"
                >
                  <span className="text-sm text-line">{item.label}</span>
                  <span className="text-right font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="px-4 text-center text-sm leading-6 text-ink-soft">
            Можно закрыть вкладку — результат сохранится в вашем проекте.
          </p>
        </aside>

        <main className="min-w-0">
          <div className="mb-10">
            <p className="rv-eyebrow mb-3">
              Шаг {currentStepIndex + 1} из {GENERATION_PROGRESS_STEPS.length}
            </p>

            <h1 className="max-w-4xl text-section-title text-ink">
              AI создаёт ваш интерьер
            </h1>

            <p className="mt-3 max-w-2xl text-body-lg text-ink-soft">
              Обычно это занимает около двух минут. Мы подбираем товары,
              собираем несколько комплектов и генерируем варианты интерьера.
            </p>
          </div>

          <GenerationPreview
            progress={progress}
            previewIndex={previewIndex}
            generatedVariantsCount={generatedVariantsCount}
            totalVariantsCount={totalVariantsCount}
          />

          <CurrentGenerationStep
            currentStepIndex={currentStepIndex}
            currentStep={currentStep}
            isLoading={isLoading}
          />

          <GenerationStepList currentStepIndex={currentStepIndex} />
        </main>
      </div>
    </div>
  );
}

type GenerationTopbarProps = {
  progress: number;
  elapsedSeconds: number;
};

function GenerationTopbar({ progress, elapsedSeconds }: GenerationTopbarProps) {
  return (
    <div className="sticky top-0 z-40 border-b border-line/40 bg-white/95 backdrop-blur-xl">
      <div className="rv-container-wide flex items-center justify-between gap-6 py-5">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-soft">Новый проект</span>
          <span className="text-line">·</span>
          <span className="font-medium text-ink">Генерация</span>
        </div>

        <div className="flex items-center gap-2 text-sm text-ink-soft">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-pill bg-brand opacity-75" />
            <span className="relative inline-flex size-2 rounded-pill bg-brand" />
          </span>

          <span>AI работает · {formatGenerationTime(elapsedSeconds)}</span>
        </div>
      </div>

      <div className="h-1 bg-line/30">
        <div
          className="h-full bg-brand transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

type GenerationPreviewProps = {
  progress: number;
  previewIndex: number;
  generatedVariantsCount: number;
  totalVariantsCount: number;
};

function GenerationPreview({
  progress,
  previewIndex,
  generatedVariantsCount,
  totalVariantsCount,
}: GenerationPreviewProps) {
  return (
    <div className="relative mb-8 aspect-[4/3] overflow-hidden rounded-card border border-line/40 bg-white">
      {GENERATION_PREVIEW_IMAGES.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          className={cn(
            'object-cover blur-[10px] saturate-105 transition-opacity duration-700',
            index === previewIndex ? 'opacity-100' : 'opacity-0',
          )}
          sizes="(min-width: 1024px) 65vw, 100vw"
          priority={index === 0}
        />
      ))}

      <div
        className="pointer-events-none absolute inset-x-0 h-32 bg-gradient-to-b from-transparent via-brand/45 to-transparent transition-[top] duration-300"
        style={{
          top: `${progress}%`,
          transform: 'translateY(-50%)',
        }}
      />

      <div className="absolute inset-0 bg-gradient-to-t from-white/40 via-transparent to-white/10" />

      <div className="absolute left-5 top-5">
        <div className="rounded-pill border border-line/40 bg-white/90 px-4 py-2 text-xs uppercase tracking-[0.2em] text-ink-soft backdrop-blur">
          Превью генерации
        </div>
      </div>

      <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
        <div className="rounded-md bg-white/95 px-5 py-4 shadow-soft backdrop-blur">
          <div className="mb-1 text-xs uppercase tracking-[0.2em] text-ink-soft">
            Прогресс
          </div>

          <div className="text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-none tracking-tight text-ink">
            {Math.round(progress)}
            <span className="text-brand">%</span>
          </div>
        </div>

        <div className="rounded-md bg-white/95 px-5 py-4 shadow-soft backdrop-blur">
          <div className="mb-2 text-xs uppercase tracking-[0.2em] text-ink-soft">
            Вариантов
          </div>

          <div className="flex gap-1.5">
            {Array.from({ length: totalVariantsCount }).map((_, item) => (
              <span
                key={item}
                className={cn(
                  'size-3 rounded-pill transition-all',
                  item < generatedVariantsCount ? 'bg-brand' : 'bg-line/50',
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CurrentGenerationStep({
  currentStepIndex,
  currentStep,
  isLoading,
}: {
  currentStepIndex: number;
  currentStep?: string | null;
  isLoading?: boolean;
}) {
  const step = GENERATION_PROGRESS_STEPS[currentStepIndex];

  return (
    <div className="mb-6 rounded-card border border-line/60 p-8">
      <div className="mb-4 flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-brand" />
        <span className="rv-eyebrow">Сейчас</span>
      </div>

      <h2 className="text-[clamp(1.25rem,2.2vw,1.625rem)] font-semibold leading-tight tracking-tight text-ink">
        {isLoading ? 'Загружаем статус генерации' : currentStep || step.title}
      </h2>

      <p className="mt-2 text-sm text-ink-soft">{step.detail}</p>
    </div>
  );
}

function GenerationStepList({
  currentStepIndex,
}: {
  currentStepIndex: number;
}) {
  return (
    <div className="rounded-card border border-line/60 p-3">
      {GENERATION_PROGRESS_STEPS.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const isDone = index < currentStepIndex;
        const StepIcon = step.icon;

        return (
          <div
            key={step.title}
            className={cn(
              'flex items-center gap-4 rounded-md px-5 py-4 transition-all',
              isCurrent && 'bg-brand-soft',
            )}
          >
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-sm transition-all',
                isDone && 'bg-brand text-white',
                isCurrent && 'bg-dark text-white',
                !isDone &&
                  !isCurrent &&
                  'border border-line/50 bg-white text-line',
              )}
            >
              {isDone ? <CheckCircle size={20} /> : <StepIcon size={20} />}
            </div>

            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'truncate text-sm',
                  isCurrent || isDone ? 'text-ink' : 'text-ink-soft',
                  isCurrent && 'font-semibold',
                )}
              >
                {step.title}
              </div>
            </div>

            {isCurrent ? (
              <Loader2 size={16} className="shrink-0 animate-spin text-brand" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
