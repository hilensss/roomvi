'use client';

import { useMemo, useState } from 'react';
import type { CatalogFiltersState } from '../model/catalog.types';
import {
  CATALOG_PRICE_MAX,
  CATALOG_PRICE_MIN,
  formatMoney,
  getActiveFiltersCount,
} from '../lib/catalog.helpers';
import { useCatalogProductsQuery } from '../api/catalog-queries';
import { CatalogTopbar } from './catalog-topbar';
import { CatalogFilters } from './catalog-filters';
import { CatalogProductCard } from './catalog-product-card';
import { CatalogCtaCard } from './catalog-cta-card';

const INITIAL_FILTERS: CatalogFiltersState = {
  search: '',

  roomTypes: [],
  categories: [],
  styles: [],
  stockStatuses: [],

  brands: [],
  colors: [],

  minPrice: CATALOG_PRICE_MIN,
  maxPrice: CATALOG_PRICE_MAX,

  sort: 'popular',
  limit: 20,
  offset: 0,
};

export function CatalogPage() {
  const [filters, setFilters] = useState<CatalogFiltersState>(INITIAL_FILTERS);
  const [favorites, setFavorites] = useState<string[]>([]);

  const productsQuery = useCatalogProductsQuery(filters);

  const products = useMemo(() => {
    const data = productsQuery.data;

    if (!data) return [];

    if (Array.isArray(data)) {
      return data;
    }

    return data.items;
  }, [productsQuery.data]);

  const total = useMemo(() => {
    const data = productsQuery.data;

    if (!data) return 0;

    if (Array.isArray(data)) {
      return data.length;
    }

    return data.total;
  }, [productsQuery.data]);

  const activeFiltersCount = getActiveFiltersCount(filters);

  const resetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const toggleFavorite = (productId: string) => {
    setFavorites((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId],
    );
  };

  return (
    <div className="min-h-full bg-white">
      <CatalogTopbar
        total={total}
        filters={filters}
        onFiltersChange={setFilters}
      />

      <section className="rv-container-wide pt-12 pb-8">
        <p className="rv-eyebrow mb-3">Каталог партнёров</p>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <h1 className="text-section-title text-ink">
            Мебель, которая прямо сейчас
            <br />в наличии у наших партнёров.
          </h1>

          <p className="max-w-sm text-ink-soft">
            24 000+ позиций от 180+ брендов. Цены и наличие синхронизируются
            каждый час.
          </p>
        </div>
      </section>

      <div className="rv-container-wide grid gap-10 pb-20 lg:grid-cols-[260px_1fr]">
        <CatalogFilters
          filters={filters}
          activeFiltersCount={activeFiltersCount}
          onFiltersChange={setFilters}
          onReset={resetFilters}
        />

        <main className="min-w-0">
          <ActiveFilterChips
            filters={filters}
            onFiltersChange={setFilters}
            onReset={resetFilters}
          />

          {productsQuery.isLoading ? (
            <CatalogGridSkeleton />
          ) : productsQuery.isError ? (
            <CatalogError message={productsQuery.error.message} />
          ) : products.length === 0 ? (
            <CatalogEmptyState onReset={resetFilters} />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <CatalogProductCard
                  key={product.id}
                  product={product}
                  isFavorite={favorites.includes(product.id)}
                  onToggleFavorite={() => toggleFavorite(product.id)}
                />
              ))}
            </div>
          )}

          <CatalogCtaCard />
        </main>
      </div>
    </div>
  );
}

function ActiveFilterChips({
  filters,
  onFiltersChange,
}: {
  filters: CatalogFiltersState;
  onFiltersChange: React.Dispatch<React.SetStateAction<CatalogFiltersState>>;
  onReset: () => void;
}) {
  const tags = [
    ...filters.roomTypes.map((value) => ({
      group: 'roomTypes' as const,
      value,
    })),
    ...filters.categories.map((value) => ({
      group: 'categories' as const,
      value,
    })),
    ...filters.styles.map((value) => ({
      group: 'styles' as const,
      value,
    })),
    ...filters.stockStatuses.map((value) => ({
      group: 'stockStatuses' as const,
      value: value === 'IN_STOCK' ? 'Только в наличии' : value,
      rawValue: value,
    })),
    ...filters.brands.map((value) => ({
      group: 'brands' as const,
      value,
    })),
    ...filters.colors.map((value) => ({
      group: 'colors' as const,
      value,
    })),
  ];

  const hasPriceFilter = filters.maxPrice < CATALOG_PRICE_MAX;
  const hasSearchFilter = Boolean(filters.search.trim());

  if (!tags.length && !hasPriceFilter && !hasSearchFilter) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <button
          key={`${tag.group}:${tag.value}`}
          type="button"
          onClick={() =>
            onFiltersChange((prev) => ({
              ...prev,
              [tag.group]: prev[tag.group].filter(
                (item) =>
                  item !== ('rawValue' in tag ? tag.rawValue : tag.value),
              ),
              offset: 0,
            }))
          }
          className="rounded-pill bg-brand-soft px-3 py-1.5 text-sm text-ink transition hover:text-brand"
        >
          {tag.value} ×
        </button>
      ))}

      {hasPriceFilter ? (
        <button
          type="button"
          onClick={() =>
            onFiltersChange((prev) => ({
              ...prev,
              maxPrice: CATALOG_PRICE_MAX,
              offset: 0,
            }))
          }
          className="rounded-pill bg-brand-soft px-3 py-1.5 text-sm text-ink transition hover:text-brand"
        >
          до {formatMoney(filters.maxPrice)} ×
        </button>
      ) : null}

      {hasSearchFilter ? (
        <button
          type="button"
          onClick={() =>
            onFiltersChange((prev) => ({
              ...prev,
              search: '',
              offset: 0,
            }))
          }
          className="rounded-pill bg-brand-soft px-3 py-1.5 text-sm text-ink transition hover:text-brand"
        >
          {filters.search} ×
        </button>
      ) : null}
    </div>
  );
}

function CatalogGridSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index}>
          <div className="mb-4 aspect-[4/5] animate-pulse rounded-lg bg-line/30" />
          <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-line/30" />
          <div className="h-5 w-1/2 animate-pulse rounded bg-line/30" />
        </div>
      ))}
    </div>
  );
}

function CatalogError({ message }: { message: string }) {
  return (
    <div className="rounded-card border border-line/60 p-8">
      <h2 className="text-2xl font-semibold text-ink">
        Не удалось загрузить каталог
      </h2>
      <p className="mt-2 text-ink-soft">{message}</p>
    </div>
  );
}

function CatalogEmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-card border border-dashed border-line p-16 text-center">
      <h2 className="mb-2 text-2xl font-semibold text-ink">
        Ничего не нашлось
      </h2>
      <p className="mb-6 text-ink-soft">
        Попробуйте сбросить фильтры или поменять запрос.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="rounded-pill border border-ink px-6 py-3 text-ink transition hover:bg-ink hover:text-white"
      >
        Сбросить фильтры
      </button>
    </div>
  );
}
