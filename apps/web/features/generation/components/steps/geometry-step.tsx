'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CreateProjectFormState } from '../../model/create-project.types';
import { getRoomArea } from '../../lib/create-project.helpers';

type StepProps = {
  form: CreateProjectFormState;
  onChange: Dispatch<SetStateAction<CreateProjectFormState>>;
};

const fields = [
  { key: 'width', label: 'Ширина', placeholder: '4.5', unit: 'м' },
  { key: 'depth', label: 'Длина', placeholder: '5.2', unit: 'м' },
  { key: 'height', label: 'Высота потолков', placeholder: '2.7', unit: 'м' },
] as const;

export function GeometryStep({ form, onChange }: StepProps) {
  const area = getRoomArea(form);

  return (
    <div className="grid gap-4 md:grid-cols-3 pb-6">
      {fields.map((field) => (
        <div
          key={field.key}
          className="rounded-lg border border-line/60 p-6 transition-colors focus-within:border-brand"
        >
          <label className="mb-3 block text-sm text-ink-soft">
            {field.label}
          </label>

          <div className="flex items-baseline gap-2">
            <input
              type="number"
              step="0.1"
              min={1}
              value={form[field.key] ?? undefined}
              onChange={(event) =>
                onChange((prev) => ({
                  ...prev,
                  [field.key]: event.target.value,
                }))
              }
              placeholder={field.placeholder}
              className="min-w-0 flex-1 bg-transparent text-[2.5rem] font-medium tracking-tight text-ink outline-none placeholder:text-line"
            />

            <span className="text-ink-soft">{field.unit}</span>
          </div>
        </div>
      ))}

      {area ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-line bg-white p-6 md:col-span-3">
          <span className="text-ink-soft">Площадь комнаты</span>
          <span className="text-2xl font-semibold text-ink">{area} м²</span>
        </div>
      ) : null}
    </div>
  );
}
