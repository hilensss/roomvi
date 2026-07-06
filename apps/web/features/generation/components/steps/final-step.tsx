'use client';

import { Sparkles } from 'lucide-react';
import type { CreateProjectFormState } from '../../model/create-project.types';
import { getProjectBrief } from '../../lib/create-project.helpers';

type FinalStepProps = {
  form: CreateProjectFormState;
};

export function FinalStep({ form }: FinalStepProps) {
  const brief = getProjectBrief(form);

  return (
    <div className="flex-1 lg:max-h-90 pb-6 overflow-y-auto">
      <div className="mb-6 rounded-card border border-line/60 p-6">
        <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
          {brief.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between border-b border-line/40 py-3 last:border-0"
            >
              <span className="text-sm text-ink-soft">{item.label}</span>
              <span className="font-medium text-ink">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-4 rounded-card bg-brand-soft p-6">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-brand">
          <Sparkles size={20} className="text-white" />
        </div>

        <div>
          <p className="mb-1 font-semibold text-ink">Всё готово к запуску</p>
          <p className="text-sm leading-6 text-ink-soft">
            AI проанализирует ваш бриф и сгенерирует 3–5 фотореалистичных
            интерьеров с реальными товарами. Это займёт около 2 минут.
          </p>
        </div>
      </div>
    </div>
  );
}
