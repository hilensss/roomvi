'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { CreateProjectStep } from '../model/create-project.data';

type CreateProjectNavigationProps = {
  step: CreateProjectStep;
  canGoNext: boolean;
  isSubmitting: boolean;
  errorMessage?: string;
  onBack: () => void;
  onNext: () => void;
  onGenerate: () => void;
};

export function CreateProjectNavigation({
  step,
  canGoNext,
  isSubmitting,
  errorMessage,
  onBack,
  onNext,
  onGenerate,
}: CreateProjectNavigationProps) {
  return (
    <div className=" border-t border-line/40 pt-6">
      {errorMessage ? (
        <div className="mb-5 rounded-md bg-brand-soft px-5 py-4 text-sm text-brand">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 1 || isSubmitting}
          className="inline-flex items-center gap-2 text-ink-soft transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowLeft size={16} />
          Назад
        </button>

        {step < 6 ? (
          <Button
            type="button"
            variant="dark"
            withArrow
            onClick={onNext}
            className="disabled:pointer-events-none disabled:opacity-40"
            disabled={!canGoNext}
          >
            <span
              className={!canGoNext ? 'pointer-events-none opacity-50' : ''}
            >
              Продолжить
            </span>
          </Button>
        ) : (
          <Button
            type="button"
            variant="brand"
            withArrow
            onClick={onGenerate}
            disabled={isSubmitting}
            className="shadow-soft disabled:pointer-events-none disabled:opacity-60"
          >
            {isSubmitting ? 'Запускаем...' : 'Сгенерировать дизайн'}
          </Button>
        )}
      </div>
    </div>
  );
}
