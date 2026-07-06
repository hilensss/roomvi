'use client';

import { Check } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { cn } from '@/shared/lib/cn';
import { ROOM_TYPE_OPTIONS } from '../../model/create-project.data';
import type { CreateProjectFormState } from '../../model/create-project.types';

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
};

export function RoomTypeStep({ form, onChange }: StepProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 flex-1 lg:max-h-90 pb-6 overflow-y-auto">
      {ROOM_TYPE_OPTIONS.map((item) => {
        const active = form.roomType === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange((prev) => ({ ...prev, roomType: item.id }))}
            className={cn(
              'group relative overflow-hidden rounded-lg border p-6 text-left transition-all rv-focus-ring',
              active
                ? 'border-brand bg-brand-soft shadow-soft'
                : 'border-line/60 bg-white hover:border-ink',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex gap-1 items-center">
                  <div className="mb-2 text-4xl">{item.icon}</div>
                  <div className="mb-1 text-lg font-semibold text-ink">
                    {item.name}
                  </div>
                </div>
                <div className="text-sm text-ink-soft">{item.hint}</div>
              </div>

              <div
                className={cn(
                  'flex size-6 items-center justify-center rounded-pill border transition-all',
                  active ? 'border-brand bg-brand' : 'border-line',
                )}
              >
                {active ? <Check size={14} className="text-white" /> : null}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
