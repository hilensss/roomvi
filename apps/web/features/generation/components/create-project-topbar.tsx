'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import {
  CREATE_PROJECT_STEPS,
  type CreateProjectStep,
} from '../model/create-project.data';
import { getStepTitle } from '../lib/create-project.helpers';

type CreateProjectTopbarProps = {
  step: CreateProjectStep;
};

export function CreateProjectTopbar({ step }: CreateProjectTopbarProps) {
  const progress = (step / CREATE_PROJECT_STEPS.length) * 100;

  return (
    <div className="sticky top-20 z-40 border-b border-line/40 bg-white/95 backdrop-blur-xl">
      <div className="rv-container-wide flex items-center justify-between gap-6 py-5">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-soft">Новый проект</span>
          <span className="text-line">·</span>
          <span className="font-medium text-ink">
            {String(step).padStart(2, '0')} / 06 — {getStepTitle(step)}
          </span>
        </div>

        <Link
          href="/"
          aria-label="Закрыть"
          className="flex size-10 items-center justify-center rounded-pill border border-line/60 text-ink transition-colors hover:border-ink rv-focus-ring"
        >
          <X size={16} />
        </Link>
      </div>

      <div className="h-1 bg-line/30">
        <div
          className="h-full bg-brand transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
