'use client';

import Image from 'next/image';
import { Check } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { cn } from '@/shared/lib/cn';
import { STYLE_OPTIONS } from '../../model/create-project.data';
import type { CreateProjectFormState } from '../../model/create-project.types';

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
};

export function StyleStep({ form, onChange }: StepProps) {
  return (
    <div className="grid gap-5 sm:grid-cols-2  flex-1 lg:max-h-90 pb-6 overflow-y-auto">
      {STYLE_OPTIONS.map((style) => {
        const active = form.style === style.id;

        return (
          <button
            key={style.id}
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, style: style.id }))}
            className={cn(
              'group overflow-hidden rounded-lg border-2 text-left transition-all rv-focus-ring',
              active
                ? 'border-brand shadow-card'
                : 'border-transparent hover:border-line',
            )}
          >
            <div className="relative h-56 overflow-hidden">
              <Image
                src={style.image}
                alt={style.name}
                fill
                className={cn(
                  'object-cover transition-transform duration-500',
                  active ? 'scale-105' : 'group-hover:scale-105',
                )}
                sizes="(min-width: 768px) 50vw, 100vw"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />

              {active ? (
                <div className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-pill bg-brand shadow-soft">
                  <Check size={16} className="text-white" />
                </div>
              ) : null}

              <div className="absolute bottom-4 left-5 right-5 text-white">
                <div className="text-xl font-semibold">{style.name}</div>
                <div className="text-sm text-white/85">{style.description}</div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
