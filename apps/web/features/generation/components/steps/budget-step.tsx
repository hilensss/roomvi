'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import { BUDGET_MAX, BUDGET_MIN } from '../../model/create-project.data';
import type { CreateProjectFormState } from '../../model/create-project.types';
import { getBudgetPercent } from '../../lib/create-project.helpers';
import {
  formatCurrency,
  getDisplayCurrencyAmount,
  getRublesFromDisplayCurrency,
  RUB_PER_USD,
  type Locale,
  USD_BUDGET_STEP,
} from '@/shared/i18n/locale';
import { useLocale } from '@/shared/providers/locale-provider';

const RUB_BUDGET_STEP = 10_000;

type ExactBudgetDraft = {
  locale: Locale;
  value: string;
};

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
};

export function BudgetStep({ form, onChange }: StepProps) {
  const { locale } = useLocale();
  const budgetPercent = getBudgetPercent(form.budgetMax);
  const displayBudget = getDisplayCurrencyAmount(form.budgetMax, locale);
  const displayBudgetMin = getDisplayCurrencyAmount(BUDGET_MIN, locale);
  const displayBudgetMax = getDisplayCurrencyAmount(BUDGET_MAX, locale);
  const currencySymbol = locale === 'en' ? '$' : '₽';
  const sliderStep =
    locale === 'en'
      ? Math.max(1, Math.round(USD_BUDGET_STEP * RUB_PER_USD))
      : RUB_BUDGET_STEP;
  const [exactBudgetDraft, setExactBudgetDraft] =
    useState<ExactBudgetDraft | null>(null);
  const exactBudget =
    exactBudgetDraft?.locale === locale
      ? exactBudgetDraft.value
      : String(displayBudget);

  const updateBudget = (budgetInRubles: number) => {
    const clampedBudget = Math.min(
      BUDGET_MAX,
      Math.max(BUDGET_MIN, Math.round(budgetInRubles)),
    );

    onChange((prev) => ({
      ...prev,
      budgetMax: clampedBudget,
    }));
  };

  const commitExactBudget = () => {
    setExactBudgetDraft(null);

    if (!exactBudget.trim()) {
      return;
    }

    const value = Number(exactBudget);

    if (!Number.isFinite(value)) {
      return;
    }

    updateBudget(getRublesFromDisplayCurrency(value, locale));
  };

  return (
    <div className="space-y-8 pb-6">
      <div className="rounded-card border border-line/60 p-8">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm text-ink-soft">Бюджет на мебель</span>

          <span className="text-section-title text-ink">
            {formatCurrency(form.budgetMax, locale)}
          </span>
        </div>

        <label className="mt-6 block max-w-64">
          <span className="mb-2 block text-sm text-ink-soft">Точная сумма</span>
          <span className="flex items-center rounded-md border border-line bg-white px-4 transition-colors focus-within:border-brand">
            {locale === 'en' ? (
              <span className="mr-2 text-ink-soft">{currencySymbol}</span>
            ) : null}
            <input
              type="number"
              inputMode="numeric"
              min={displayBudgetMin}
              max={displayBudgetMax}
              step={1}
              value={exactBudget}
              onFocus={() =>
                setExactBudgetDraft({ locale, value: String(displayBudget) })
              }
              onChange={(event) =>
                setExactBudgetDraft({ locale, value: event.target.value })
              }
              onBlur={commitExactBudget}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="min-w-0 flex-1 bg-transparent py-3 font-semibold text-ink outline-none"
            />
            {locale === 'ru' ? (
              <span className="ml-2 text-ink-soft">{currencySymbol}</span>
            ) : null}
          </span>
        </label>

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
            step={sliderStep}
            value={form.budgetMax}
            onChange={(event) => updateBudget(Number(event.target.value))}
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
