'use client';

import type { Dispatch, SetStateAction } from 'react';
import { BUDGET_MAX, BUDGET_MIN } from '../../model/create-project.data';
import type { CreateProjectFormState } from '../../model/create-project.types';
import { getBudgetPercent } from '../../lib/create-project.helpers';
import { formatCurrency } from '@/shared/i18n/locale';
import { useLocale } from '@/shared/providers/locale-provider';

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
};

export function BudgetStep({ form, onChange }: StepProps) {
  const { locale } = useLocale();
  const budgetPercent = getBudgetPercent(form.budgetMax);

  return (
    <div className="space-y-8 pb-6">
      <div className="rounded-card border border-line/60 p-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-ink-soft">Бюджет на мебель</span>

          <span className="text-section-title text-ink">
            {formatCurrency(form.budgetMax, locale)}
          </span>
        </div>

        <div className="relative mt-8 mb-3">
          <div className="h-2 rounded-pill bg-line/40">
            <div
              className="h-full rounded-pill bg-brand"
              style={{ width: `${budgetPercent}%` }}
            />
          </div>

          <input
            type="range"
            min={BUDGET_MIN}
            max={BUDGET_MAX}
            step={10_000}
            value={form.budgetMax}
            onChange={(event) =>
              onChange((prev) => ({
                ...prev,
                budgetMax: Number(event.target.value),
              }))
            }
            className="absolute inset-0 w-full cursor-pointer opacity-0"
          />

          <div
            className="pointer-events-none absolute top-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-brand bg-white shadow-soft"
            style={{ left: `${budgetPercent}%` }}
          />
        </div>

        <div className="mt-4 flex justify-between text-sm text-ink-soft">
          <span>{formatCurrency(BUDGET_MIN, locale)}</span>
          <span>{formatCurrency(BUDGET_MAX, locale)}</span>
        </div>
      </div>
    </div>
  );
}
