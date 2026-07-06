'use client';

import { Search } from 'lucide-react';
import type { CatalogFiltersState, CatalogSort } from '../model/catalog.types';
import { getProductPlural } from '../lib/catalog.helpers';

type CatalogTopbarProps = {
  total: number;
  filters: CatalogFiltersState;
  onFiltersChange: React.Dispatch<React.SetStateAction<CatalogFiltersState>>;
};

export function CatalogTopbar({
  total,
  filters,
  onFiltersChange,
}: CatalogTopbarProps) {
  return (
    <div className="border-b border-line/40">
      <div className="rv-container-wide flex flex-wrap items-center justify-between gap-6 py-5">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-ink-soft">Каталог</span>
          <span className="text-line">·</span>
          <span className="font-medium text-ink">
            {total} {getProductPlural(total)}
          </span>
        </div>

        <div className="relative min-w-[260px] max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />

          <input
            value={filters.search}
            onChange={(event) =>
              onFiltersChange((prev) => ({
                ...prev,
                search: event.target.value,
              }))
            }
            placeholder="Найти диван, лампу, ковёр..."
            className="rv-input rounded-pill pl-11 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-soft">Сортировка:</span>

          <select
            value={filters.sort}
            onChange={(event) =>
              onFiltersChange((prev) => ({
                ...prev,
                sort: event.target.value as CatalogSort,
              }))
            }
            className="rounded-pill border border-line/60 bg-white px-4 py-2 text-sm text-ink outline-none transition focus:border-brand"
          >
            <option value="popular">Популярные</option>
            <option value="new">Сначала новинки</option>
            <option value="price-asc">Сначала дешёвые</option>
            <option value="price-desc">Сначала дорогие</option>
          </select>
        </div>
      </div>
    </div>
  );
}
