'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import {
  CREATE_PROJECT_STEPS,
  type CreateProjectStep,
} from '../model/create-project.data';
import type { ProjectBriefItem } from '../model/create-project.types';

type ProjectBriefProps = {
  brief: ProjectBriefItem[];
  currentStep: CreateProjectStep;
  onStepClick: (step: CreateProjectStep) => void;
};

export function ProjectBrief({
  brief,
  currentStep,
  onStepClick,
}: ProjectBriefProps) {
  return (
    <aside className="lg:sticky lg:top-48 lg:self-start">
      <div className="overflow-hidden rounded-card bg-dark p-8 text-white">
        <div className="pointer-events-none absolute" />

        <div className="mb-6 flex items-center gap-2">
          <Sparkles size={16} className="text-brand" />
          <span className="rv-eyebrow">Бриф</span>
        </div>

        <h2 className="mb-2 text-2xl font-semibold tracking-tight">
          Ваш проект собирается
        </h2>

        <p className="mb-8 text-sm leading-6 text-line">
          Чем точнее данные — тем ближе результат к вашему вкусу.
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

      <div className="mt-6 px-2">
        <div className="grid grid-cols-6 gap-2">
          {CREATE_PROJECT_STEPS.map((_, index) => {
            const step = (index + 1) as CreateProjectStep;

            return (
              <button
                key={step}
                type="button"
                disabled={step > currentStep}
                onClick={() => onStepClick(step)}
                className={cn(
                  'h-1.5 rounded-pill transition-all rv-focus-ring',
                  step === currentStep && 'bg-brand',
                  step < currentStep && 'bg-dark',
                  step > currentStep && 'bg-line/40',
                )}
                aria-label={`Шаг ${step}`}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}
