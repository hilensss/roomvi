'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Check, Upload } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { CreateProjectFormState } from '../../model/create-project.types';

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
  onSkipPhoto: () => void;
};

export function PhotoStep({ form, onChange, onSkipPhoto }: StepProps) {
  const hasPhoto = Boolean(form.sourceImageFile);

  return (
    <div className="pb-6">
      <label
        className={cn(
          'group relative block cursor-pointer overflow-hidden rounded-card border-2 border-dashed p-12 transition-all',
          hasPhoto
            ? 'border-brand bg-brand-soft'
            : 'border-line hover:border-brand hover:bg-brand-soft/40',
        )}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            onChange((prev) => ({ ...prev, sourceImageFile: file }));
          }}
        />

        <div className="flex flex-col items-center text-center">
          <div
            className={cn(
              'mb-4 flex size-16 items-center justify-center rounded-lg transition-all',
              hasPhoto
                ? 'bg-brand text-white'
                : 'bg-brand-soft text-brand group-hover:bg-brand group-hover:text-white',
            )}
          >
            {hasPhoto ? <Check size={36} /> : <Upload size={36} />}
          </div>

          <div className="mb-2 text-xl font-semibold text-ink">
            {hasPhoto
              ? form.sourceImageFile?.name
              : 'Перетащите фото или нажмите'}
          </div>

          <div className="text-sm text-ink-soft">
            JPG, PNG, WEBP до 10 МБ — желательно с хорошим освещением
          </div>
        </div>
      </label>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {['✓ Свет дневной', '✓ Видны все стены', '✓ Без людей и мебели'].map(
          (tip) => (
            <div
              key={tip}
              className="rounded-md border border-line/40 bg-white px-5 py-3 text-sm text-ink-soft"
            >
              {tip}
            </div>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          onChange((prev) => ({ ...prev, sourceImageFile: null }));
          onSkipPhoto();
        }}
        className="mt-4 text-sm text-ink-soft underline underline-offset-4 transition-colors hover:text-brand"
      >
        Пропустить — у меня нет фото
      </button>
    </div>
  );
}
