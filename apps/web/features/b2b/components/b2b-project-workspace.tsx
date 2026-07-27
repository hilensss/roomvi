'use client';

import Link from 'next/link';
import { Check, Download, LoaderCircle, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatMoney } from '@/features/catalog/lib/catalog.helpers';
import type { DesignVariant, Product } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { SafeImage } from '@/shared/ui/safe-image';
import { getB2BVariantDownloadUrl } from '../api/b2b-api';
import {
  useB2BProjectCatalogQuery,
  useB2BProjectQuery,
  useReplaceB2BProjectProductsMutation,
  useStartB2BProjectGenerationMutation,
} from '../api/b2b-queries';
import { DeveloperProjectWorkspace } from './developer-project-workspace';

const statusLabels = {
  DRAFT: 'Черновик',
  ANALYZING: 'Распознавание',
  REVIEW_REQUIRED: 'Нужна проверка',
  READY_TO_GENERATE: 'Готов к генерации',
  GENERATING: 'Генерация',
  PARTIALLY_COMPLETED: 'Готово частично',
  COMPLETED: 'Готово',
  FAILED: 'Ошибка',
} as const;

const CATALOG_PAGE_SIZE = 24;

export function B2BProjectWorkspace({ projectId }: { projectId: string }) {
  const projectQuery = useB2BProjectQuery(projectId);
  const [search, setSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(0);
  const catalogParams = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(CATALOG_PAGE_SIZE),
      offset: String(catalogPage * CATALOG_PAGE_SIZE),
    });
    if (search.trim()) params.set('search', search.trim());
    return params;
  }, [catalogPage, search]);
  const catalogQuery = useB2BProjectCatalogQuery(
    projectId,
    catalogParams,
    projectQuery.data?.type === 'FURNITURE_LINE',
  );
  const replaceMutation = useReplaceB2BProjectProductsMutation();
  const startMutation = useStartB2BProjectGenerationMutation();
  const [selectionOverride, setSelectionOverride] = useState<string[] | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const project = projectQuery.data;

  if (projectQuery.isLoading) {
    return <PageState>Загружаем проект...</PageState>;
  }
  if (projectQuery.isError || !project) {
    return <PageState>Не удалось загрузить проект.</PageState>;
  }
  if (project.type === 'DEVELOPER_FLOOR_PLAN') {
    return <DeveloperProjectWorkspace project={project} />;
  }

  const savedIds = project.products.map(({ productId }) => productId);
  const selectedIds = selectionOverride ?? savedIds;
  const selectionLimit = project.sourceImageUrl ? 9 : 10;
  const selectionChanged =
    selectedIds.length !== savedIds.length ||
    selectedIds.some((id, index) => id !== savedIds[index]);
  const editable =
    project.status !== 'GENERATING' && project.status !== 'COMPLETED';
  const latestJob = project.roomProject?.generationJobs[0];
  const variants = latestJob?.designVariants ?? [];

  function toggleProduct(productId: string) {
    if (selectedIds.includes(productId)) {
      setSelectionOverride(selectedIds.filter((id) => id !== productId));
      return;
    }
    if (selectedIds.length < selectionLimit) {
      setSelectionOverride([...selectedIds, productId]);
    }
  }

  async function saveSelection() {
    setActionError(null);
    try {
      await replaceMutation.mutateAsync({ projectId, productIds: selectedIds });
      setSelectionOverride(null);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Не удалось сохранить товары',
      );
    }
  }

  async function startGeneration() {
    setActionError(null);
    try {
      await startMutation.mutateAsync(projectId);
    } catch (caught) {
      setActionError(
        caught instanceof Error
          ? caught.message
          : 'Не удалось запустить генерацию',
      );
    }
  }

  return (
    <div className="rv-container-wide py-10">
      <Link
        href="/manager/projects"
        className="text-sm text-ink-soft transition hover:text-brand"
      >
        ← Все B2B-проекты
      </Link>

      <div className="mt-5 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="rv-eyebrow mb-2">Мебельная линейка</p>
          <h1 className="text-section-title text-ink">{project.name}</h1>
          <p className="mt-2 text-ink-soft">
            {project.partnerName} · {project.supplier.name}
          </p>
        </div>
        <span className="w-fit rounded-pill bg-brand-soft px-4 py-2 text-sm font-medium text-brand">
          {statusLabels[project.status]}
        </span>
      </div>

      <section className="mt-8 grid gap-4 rounded-card border border-line/50 bg-white p-5 text-sm md:grid-cols-3 md:p-6">
        <Meta label="Комната" value={project.roomType} />
        <Meta label="Стиль" value={project.style} />
        <Meta
          label="Выбрано"
          value={`${selectedIds.length} из ${selectionLimit} товаров`}
        />
        {project.managerComment ? (
          <Meta
            label="Комментарий"
            value={project.managerComment}
            className="md:col-span-3"
          />
        ) : null}
      </section>

      {project.status === 'GENERATING' && latestJob ? (
        <GenerationProgress
          progress={latestJob.progress}
          step={latestJob.currentStep ?? 'Генерируем две визуализации'}
        />
      ) : null}

      {project.status === 'FAILED' ? (
        <div className="mt-6 rounded-card border border-brand/30 bg-brand-soft p-5 text-brand">
          {latestJob?.errorMessage ||
            'Генерация завершилась ошибкой. Проверьте подборку и попробуйте снова.'}
        </div>
      ) : null}

      {variants.length > 0 ? (
        <Results projectId={projectId} variants={variants} />
      ) : null}

      {editable ? (
        <section className="mt-8">
          <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="rv-eyebrow mb-2">Ручная подборка</p>
              <h2 className="text-3xl font-semibold text-ink">
                Выберите от 1 до {selectionLimit} товаров
              </h2>
              <p className="mt-2 text-ink-soft">
                Оба варианта будут созданы строго с этой подборкой.
              </p>
            </div>
            <label className="relative w-full md:max-w-sm">
              <span className="sr-only">Поиск товаров</span>
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCatalogPage(0);
                }}
                className="h-12 w-full rounded-pill border border-line/60 bg-white pl-11 pr-4 outline-none transition focus:border-brand"
                placeholder="Поиск по каталогу"
              />
            </label>
          </div>

          {catalogQuery.isLoading ? (
            <PageState>Загружаем каталог...</PageState>
          ) : catalogQuery.isError || !catalogQuery.data ? (
            <PageState>Не удалось загрузить товары поставщика.</PageState>
          ) : catalogQuery.data.items.length === 0 ? (
            <PageState>Подходящих товаров не найдено.</PageState>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {catalogQuery.data.items.map((product) => (
                <SelectionCard
                  key={product.id}
                  product={product}
                  selected={selectedIds.includes(product.id)}
                  disabled={
                    selectedIds.length >= selectionLimit &&
                    !selectedIds.includes(product.id)
                  }
                  onToggle={() => toggleProduct(product.id)}
                />
              ))}
            </div>
          )}

          {catalogQuery.data &&
          catalogQuery.data.total > catalogQuery.data.limit ? (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() =>
                  setCatalogPage((current) => Math.max(0, current - 1))
                }
                disabled={catalogQuery.data.offset === 0}
                className="rounded-pill border border-line/60 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
              >
                Назад
              </button>
              <span className="text-sm text-ink-soft">
                Страница{' '}
                {Math.floor(
                  catalogQuery.data.offset / catalogQuery.data.limit,
                ) + 1}{' '}
                из{' '}
                {Math.ceil(
                  catalogQuery.data.total / catalogQuery.data.limit,
                )}
              </span>
              <button
                type="button"
                onClick={() => setCatalogPage((current) => current + 1)}
                disabled={
                  catalogQuery.data.offset + catalogQuery.data.limit >=
                  catalogQuery.data.total
                }
                className="rounded-pill border border-line/60 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
              >
                Далее
              </button>
            </div>
          ) : null}

          {actionError ? (
            <p role="alert" className="mt-5 text-sm text-brand">
              {actionError}
            </p>
          ) : null}

          <div className="sticky bottom-4 mt-8 flex flex-col justify-between gap-4 rounded-card border border-line/60 bg-white/95 p-4 shadow-float backdrop-blur md:flex-row md:items-center">
            <span className="text-sm text-ink-soft">
              Выбрано: {selectedIds.length}. Для генерации сохраните подборку.
            </span>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={saveSelection}
                disabled={
                  selectedIds.length < 1 ||
                  !selectionChanged ||
                  replaceMutation.isPending
                }
                className="rounded-pill border border-line/60 px-6 py-3 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand disabled:pointer-events-none disabled:opacity-40"
              >
                {replaceMutation.isPending
                  ? 'Сохраняем...'
                  : `Сохранить подборку (${selectedIds.length})`}
              </button>
              <button
                type="button"
                onClick={startGeneration}
                disabled={
                  !['READY_TO_GENERATE', 'FAILED'].includes(project.status) ||
                  selectionChanged ||
                  startMutation.isPending
                }
                className="rounded-pill bg-dark px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand disabled:pointer-events-none disabled:opacity-40"
              >
                {startMutation.isPending
                  ? 'Запускаем...'
                  : project.status === 'FAILED'
                    ? 'Повторить 2 визуализации'
                    : 'Создать 2 визуализации'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SelectionCard({
  product,
  selected,
  disabled,
  onToggle,
}: {
  product: Product;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-card border bg-white transition',
        selected ? 'border-brand shadow-lg' : 'border-line/50',
      )}
    >
      <div className="relative aspect-[4/3] bg-line/15">
        {product.imageUrls[0] ? (
          <SafeImage
            src={product.imageUrls[0]}
            alt={product.title}
            fill
            className="object-cover"
            sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : null}
        {selected ? (
          <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-brand text-white">
            <Check size={16} />
          </span>
        ) : null}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 font-medium text-ink">{product.title}</h3>
        <p className="mt-2 text-sm font-semibold text-ink">
          {formatMoney(product.price)}
        </p>
        <button
          type="button"
          aria-label={`${selected ? 'Убрать' : 'Выбрать'} ${product.title}`}
          aria-pressed={selected}
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            'mt-4 w-full rounded-pill px-4 py-2.5 text-sm font-medium transition disabled:pointer-events-none disabled:opacity-35',
            selected
              ? 'bg-brand text-white'
              : 'border border-line/60 text-ink hover:border-brand hover:text-brand',
          )}
        >
          {selected ? 'Выбрано' : 'Выбрать'}
        </button>
      </div>
    </article>
  );
}

function GenerationProgress({
  progress,
  step,
}: {
  progress: number;
  step: string;
}) {
  return (
    <section className="mt-6 rounded-card bg-dark p-6 text-white">
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-3 font-medium">
          <LoaderCircle className="size-5 animate-spin text-brand" />
          {step}
        </span>
        <span>{progress}%</span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-pill bg-white/15">
        <div
          className="h-full rounded-pill bg-brand transition-all"
          style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
        />
      </div>
    </section>
  );
}

function Results({
  projectId,
  variants,
}: {
  projectId: string;
  variants: DesignVariant[];
}) {
  return (
    <section className="mt-8">
      <div className="mb-5">
        <p className="rv-eyebrow mb-2">Результат</p>
        <h2 className="text-3xl font-semibold text-ink">
          Две визуализации линейки
        </h2>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {variants.map((variant, index) => {
          const label = `Вариант ${index + 1}`;

          return (
            <article
              key={variant.id}
              className="overflow-hidden rounded-card border border-line/50 bg-white"
            >
              <div className="relative aspect-[16/10] bg-line/15">
                <SafeImage
                  src={variant.imageUrl}
                  alt={label}
                  fill
                  className="object-cover"
                  sizes="(min-width: 1280px) 50vw, 100vw"
                />
              </div>
              <div className="p-5 md:p-6">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-xl font-semibold text-ink">{label}</h3>
                    <p className="mt-1 text-sm text-ink-soft">
                      Подборка: {formatMoney(variant.totalPrice)}
                    </p>
                  </div>
                  <a
                    href={getB2BVariantDownloadUrl(projectId, variant.id)}
                    download
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Скачать визуализацию"
                    className="inline-flex items-center justify-center gap-2 rounded-pill border border-line/60 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-brand hover:text-brand"
                  >
                    <Download size={16} />
                    Скачать
                  </a>
                </div>
                <div className="mt-5 border-t border-line/40 pt-4">
                  <p className="mb-3 text-xs uppercase tracking-wider text-ink-soft">
                    Товары в визуализации
                  </p>
                  <ul className="space-y-2">
                    {variant.products.map(({ id, productSnapshot }) => (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="text-ink">
                          {productSnapshot.title}
                        </span>
                        <span className="shrink-0 text-ink-soft">
                          {formatMoney(productSnapshot.price)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Meta({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="block text-xs uppercase tracking-wider text-ink-soft">
        {label}
      </span>
      <span className="mt-1 block font-medium text-ink">{value}</span>
    </div>
  );
}

function PageState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line/50 bg-white p-10 text-center text-ink-soft">
      {children}
    </div>
  );
}
