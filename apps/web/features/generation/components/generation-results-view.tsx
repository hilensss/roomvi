'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle, ChevronRight } from 'lucide-react';
import type { DesignVariant, GenerationJob } from '@/shared/api/types';
import {
  formatMoney,
  formatProjectDimensions,
} from '../lib/generation.helpers';
import { SafeImage } from '@/shared/ui/safe-image';

type GenerationResultsViewProps = {
  job: GenerationJob;
};

export function GenerationResultsView({ job }: GenerationResultsViewProps) {
  const variants = job.designVariants ?? [];
  const project = job.roomProject;

  return (
    <div className="min-h-full bg-white">
      <div className="rv-container-wide py-12">
        <div className="mb-10">
          <div className="mb-4 flex items-center gap-2 text-ink-soft">
            <CheckCircle size={20} className="text-brand" />
            <span>
              Готово! AI создал {variants.length || 0} варианта дизайна
            </span>
          </div>

          <h1 className="mb-6 text-section-title text-ink">
            Выберите понравившийся дизайн
          </h1>

          <div className="inline-flex flex-wrap items-center gap-x-8 gap-y-3 rounded-card bg-white p-6 shadow-soft">
            <SummaryItem label="Комната" value={project.roomType} />
            <SummaryItem
              label="Размеры"
              value={formatProjectDimensions(project)}
            />
            <SummaryItem label="Стиль" value={project.style} />
            <SummaryItem
              label="Бюджет"
              value={formatMoney(project.budgetMax)}
            />
          </div>
        </div>

        {variants.length > 0 ? (
          <div className="grid gap-8 md:grid-cols-2">
            {variants.map((variant) => (
              <DesignVariantCard key={variant.id} variant={variant} />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-line/60 p-8 text-ink-soft">
            Варианты дизайна пока не найдены.
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryItem({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <span className="text-sm text-ink-soft">{label}: </span>
      <span className="font-semibold text-ink">{value ?? '—'}</span>
    </div>
  );
}

function DesignVariantCard({ variant }: { variant: DesignVariant }) {
  const productsCount = variant.products?.length ?? 0;

  return (
    <article className="overflow-hidden rounded-card bg-white shadow-card">
      <div className="relative h-80">
        <SafeImage
          src={variant.imageUrl}
          alt={variant.title ?? 'Дизайн интерьера'}
          fill
          className="object-cover"
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>

      <div className="p-6">
        <h3 className="mb-2 text-2xl font-semibold tracking-tight text-ink">
          {variant.title ?? 'Вариант дизайна'}
        </h3>

        <p className="mb-4 text-ink-soft">
          {variant.description ??
            'Фотореалистичный интерьер с реальными товарами'}
        </p>

        <div className="mb-4 flex items-center gap-3">
          <span className="rounded-pill bg-line/30 px-3 py-1 text-sm text-ink-soft">
            Дизайн-проект
          </span>

          <span className="text-sm text-ink-soft">{productsCount} товаров</span>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div>
            <div className="mb-1 text-sm text-ink-soft">Общая стоимость</div>
            <div className="text-2xl font-bold text-brand">
              {formatMoney(variant.totalPrice)}
            </div>
          </div>

          <Link
            href={`/designs/${variant.id}`}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-pill border border-line bg-white px-6 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand"
          >
            Открыть дизайн
            <ChevronRight size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}
