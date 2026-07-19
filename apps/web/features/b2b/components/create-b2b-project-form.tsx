'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { InteriorStyle, RoomType } from '@/shared/api/types';
import { uploadB2BRoomImage } from '../api/b2b-api';
import { useCreateB2BProjectMutation, useB2BSuppliersQuery } from '../api/b2b-queries';

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

const styles: Array<{ value: InteriorStyle; label: string }> = [
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

export function CreateB2BProjectForm() {
  const router = useRouter();
  const suppliersQuery = useB2BSuppliersQuery();
  const createMutation = useCreateB2BProjectMutation();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '',
    partnerName: '',
    supplierId: '',
    roomType: 'LIVING_ROOM' as RoomType,
    style: 'SCANDI' as InteriorStyle,
    managerComment: '',
    sourceImageFile: null as File | null,
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const sourceImageUrl = form.sourceImageFile
        ? (await uploadB2BRoomImage(form.sourceImageFile)).file.url
        : undefined;
      const project = await createMutation.mutateAsync({
        name: form.name.trim(),
        partnerName: form.partnerName.trim(),
        supplierId: form.supplierId,
        roomType: form.roomType,
        style: form.style,
        managerComment: form.managerComment.trim(),
        ...(sourceImageUrl ? { sourceImageUrl } : {}),
      });
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
            placeholder="Например, Линейка осень 2026"
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
            placeholder="Название мебельной компании"
          />
        </Field>
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
        <Field label="Стиль">
          <select
            value={form.style}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                style: event.target.value as InteriorStyle,
              }))
            }
            className={fieldClassName}
          >
            {styles.map((style) => (
              <option key={style.value} value={style.value}>
                {style.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Фото пустой комнаты (необязательно)"
          className="md:col-span-2"
        >
          <input
            type="file"
            accept="image/*"
            aria-label="Фото пустой комнаты (необязательно)"
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sourceImageFile: event.target.files?.[0] ?? null,
              }))
            }
            className="block w-full rounded-xl border border-line/60 bg-white px-4 py-3 text-sm text-ink file:mr-4 file:rounded-pill file:border-0 file:bg-brand-soft file:px-4 file:py-2 file:font-medium file:text-brand"
          />
          <span className="mt-2 block text-xs text-ink-soft">
            С фото можно выбрать до 9 товаров, без фото — до 10.
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
            placeholder="Пожелания к свету, композиции и настроению"
          />
        </Field>
      </div>

      {suppliersQuery.isError ? (
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
            !form.supplierId
          }
          className="rounded-pill bg-dark px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-brand disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? 'Создаём...' : 'Создать проект'}
        </button>
      </div>
    </form>
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
