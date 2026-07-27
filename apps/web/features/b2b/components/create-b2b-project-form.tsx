'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { InteriorStyle, RoomType } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { uploadB2BRoomImage } from '../api/b2b-api';
import {
  useB2BSuppliersQuery,
  useCreateB2BProjectMutation,
  useStartB2BFloorPlanAnalysisMutation,
} from '../api/b2b-queries';

const roomTypes: Array<{ value: RoomType; label: string }> = [
  { value: 'LIVING_ROOM', label: 'Гостиная' },
  { value: 'BEDROOM', label: 'Спальня' },
  { value: 'KITCHEN', label: 'Кухня' },
  { value: 'KIDS_ROOM', label: 'Детская' },
  { value: 'OFFICE', label: 'Кабинет' },
  { value: 'HALLWAY', label: 'Прихожая' },
  { value: 'BATHROOM', label: 'Санузел' },
  { value: 'STUDIO', label: 'Студия' },
];

export const b2bStyles: Array<{
  value: InteriorStyle;
  label: string;
}> = [
  { value: 'MODERN', label: 'Современный' },
  { value: 'MINIMALISM', label: 'Минимализм' },
  { value: 'SCANDI', label: 'Скандинавский' },
  { value: 'LOFT', label: 'Лофт' },
  { value: 'CLASSIC', label: 'Классика' },
  { value: 'NEOCLASSIC', label: 'Неоклассика' },
  { value: 'JAPANDI', label: 'Джапанди' },
  { value: 'PROVENCE', label: 'Прованс' },
  { value: 'ECO', label: 'Эко' },
  { value: 'HIGH_TECH', label: 'Хай-тек' },
];

const fieldClassName =
  'h-12 w-full rounded-xl border border-line/60 bg-white px-4 text-ink outline-none transition focus:border-brand';

type Scenario = 'FURNITURE_LINE' | 'DEVELOPER_FLOOR_PLAN';

export function CreateB2BProjectForm() {
  const router = useRouter();
  const suppliersQuery = useB2BSuppliersQuery();
  const createMutation = useCreateB2BProjectMutation();
  const startAnalysisMutation = useStartB2BFloorPlanAnalysisMutation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    scenario: 'FURNITURE_LINE' as Scenario,
    name: '',
    partnerName: '',
    supplierId: '',
    roomType: 'LIVING_ROOM' as RoomType,
    style: 'SCANDI' as InteriorStyle,
    defaultCeilingHeightCm: 270,
    managerComment: '',
    sourceImageFile: null as File | null,
  });

  const isDeveloper = form.scenario === 'DEVELOPER_FLOOR_PLAN';

  function chooseScenario(scenario: Scenario) {
    setForm((current) => ({
      ...current,
      scenario,
      sourceImageFile: null,
    }));
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isDeveloper && !form.sourceImageFile) {
        throw new Error('Загрузите планировку квартиры');
      }
      const sourceImageUrl = form.sourceImageFile
        ? (await uploadB2BRoomImage(form.sourceImageFile)).file.url
        : undefined;
      const project = await createMutation.mutateAsync(
        isDeveloper
          ? {
              type: 'DEVELOPER_FLOOR_PLAN',
              name: form.name.trim(),
              partnerName: form.partnerName.trim(),
              style: form.style,
              defaultCeilingHeightCm: form.defaultCeilingHeightCm,
              managerComment: form.managerComment.trim(),
              sourceImageUrl: sourceImageUrl!,
            }
          : {
              name: form.name.trim(),
              partnerName: form.partnerName.trim(),
              supplierId: form.supplierId,
              roomType: form.roomType,
              style: form.style,
              managerComment: form.managerComment.trim(),
              ...(sourceImageUrl ? { sourceImageUrl } : {}),
            },
      );
      if (isDeveloper) {
        await startAnalysisMutation.mutateAsync(project.id);
      }
      router.push(`/manager/projects/${project.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Не удалось создать проект',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-card border border-line/50 bg-white p-6 shadow-sm md:p-8"
    >
      <div className="mb-7">
        <span className="mb-3 block text-sm font-medium text-ink">
          Сценарий проекта
        </span>
        <div className="grid gap-3 sm:grid-cols-2">
          <ScenarioButton
            active={!isDeveloper}
            onClick={() => chooseScenario('FURNITURE_LINE')}
            title="Для мебельной компании"
            description="Выбрать до 10 товаров и создать две визуализации."
          />
          <ScenarioButton
            active={isDeveloper}
            onClick={() => chooseScenario('DEVELOPER_FLOOR_PLAN')}
            title="Для застройщика"
            description="Распознать комнаты на плане и проверить геометрию."
          />
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Название проекта">
          <input
            required
            maxLength={120}
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            className={fieldClassName}
            placeholder={
              isDeveloper ? 'Например, Квартира 12' : 'Например, Линейка осень 2026'
            }
          />
        </Field>
        <Field label="Партнёр">
          <input
            required
            maxLength={120}
            value={form.partnerName}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                partnerName: event.target.value,
              }))
            }
            className={fieldClassName}
            placeholder={
              isDeveloper ? 'Название застройщика' : 'Название мебельной компании'
            }
          />
        </Field>

        {!isDeveloper ? (
          <>
            <Field label="Поставщик">
              <select
                required
                value={form.supplierId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    supplierId: event.target.value,
                  }))
                }
                className={fieldClassName}
              >
                <option value="">
                  {suppliersQuery.isLoading
                    ? 'Загружаем поставщиков...'
                    : 'Выберите поставщика'}
                </option>
                {suppliersQuery.data?.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Комната">
              <select
                value={form.roomType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    roomType: event.target.value as RoomType,
                  }))
                }
                className={fieldClassName}
              >
                {roomTypes.map((roomType) => (
                  <option key={roomType.value} value={roomType.value}>
                    {roomType.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}

        <Field label="Стиль по умолчанию">
          <select
            aria-label="Стиль"
            value={form.style}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                style: event.target.value as InteriorStyle,
              }))
            }
            className={fieldClassName}
          >
            {b2bStyles.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </Field>

        {isDeveloper ? (
          <Field label="Высота потолка, см">
            <input
              type="number"
              min={200}
              max={500}
              required
              value={form.defaultCeilingHeightCm}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  defaultCeilingHeightCm: Number(event.target.value),
                }))
              }
              className={fieldClassName}
            />
          </Field>
        ) : null}

        <Field
          label={
            isDeveloper
              ? 'Планировка квартиры'
              : 'Фото пустой комнаты (необязательно)'
          }
          className="md:col-span-2"
        >
          <input
            type="file"
            accept={
              isDeveloper
                ? 'image/jpeg,image/png,image/webp'
                : 'image/*'
            }
            aria-label={
              isDeveloper
                ? 'Планировка квартиры'
                : 'Фото пустой комнаты (необязательно)'
            }
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sourceImageFile: event.target.files?.[0] ?? null,
              }))
            }
            className="block w-full rounded-xl border border-line/60 bg-white px-4 py-3 text-sm text-ink file:mr-4 file:rounded-pill file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-medium file:text-brand"
          />
          <span className="mt-2 block text-xs text-ink-soft">
            {isDeveloper
              ? 'JPG, PNG или WebP. После загрузки комнаты будут распознаны автоматически.'
              : 'С фото можно выбрать до 9 товаров, без фото — до 10.'}
          </span>
        </Field>

        <Field label="Комментарий" className="md:col-span-2">
          <textarea
            maxLength={2000}
            value={form.managerComment}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                managerComment: event.target.value,
              }))
            }
            className="min-h-28 w-full resize-y rounded-xl border border-line/60 bg-white px-4 py-3 text-ink outline-none transition focus:border-brand"
            placeholder="Внутренние пожелания и примечания"
          />
        </Field>
      </div>

      {!isDeveloper && suppliersQuery.isError ? (
        <p className="mt-5 text-sm text-brand">
          Не удалось загрузить поставщиков.
        </p>
      ) : null}
      {error ? (
        <p className="mt-5 text-sm text-brand" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex justify-end">
        <button
          type="submit"
          disabled={
            isSubmitting ||
            !form.name.trim() ||
            !form.partnerName.trim() ||
            (!isDeveloper && !form.supplierId) ||
            (isDeveloper &&
              (!form.sourceImageFile ||
                form.defaultCeilingHeightCm < 200 ||
                form.defaultCeilingHeightCm > 500))
          }
          className="rounded-pill bg-dark px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-brand disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting
            ? isDeveloper
              ? 'Создаём и распознаём...'
              : 'Создаём...'
            : isDeveloper
              ? 'Создать и распознать'
              : 'Создать проект'}
        </button>
      </div>
    </form>
  );
}

function ScenarioButton({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-4 text-left transition',
        active
          ? 'border-brand bg-brand-soft'
          : 'border-line/60 hover:border-brand/60',
      )}
    >
      <span className="block font-semibold text-ink">{title}</span>
      <span className="mt-1 block text-sm text-ink-soft">{description}</span>
    </button>
  );
}

function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-2 block text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}
