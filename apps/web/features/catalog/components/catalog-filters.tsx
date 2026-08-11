'use client';

import { Check, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/shared/lib/cn';
import type {
  InteriorStyle,
  ProductCategory,
  RoomType,
  StockStatus,
} from '@/shared/api/types';
import type { CatalogFiltersState } from '../model/catalog.types';
import {
  CATALOG_PRICE_MAX,
  CATALOG_PRICE_MIN,
  formatMoney,
  getPricePercent,
} from '../lib/catalog.helpers';

const roomTypes: { value: RoomType; label: string }[] = [
  { value: 'LIVING_ROOM', label: 'Гостиная' },
  { value: 'BEDROOM', label: 'Спальня' },
  { value: 'KITCHEN', label: 'Кухня' },
  { value: 'OFFICE', label: 'Кабинет' },
  { value: 'KIDS_ROOM', label: 'Детская' },
  { value: 'HALLWAY', label: 'Прихожая' },
  { value: 'BATHROOM', label: 'Ванная' },
  { value: 'STUDIO', label: 'Студия' },
];

const categories: { value: ProductCategory; label: string }[] = [
  { value: 'SOFA', label: 'Диваны' },
  { value: 'ARMCHAIR', label: 'Кресла' },
  { value: 'CHAIR', label: 'Стулья' },
  { value: 'TABLE', label: 'Столы' },
  { value: 'COFFEE_TABLE', label: 'Журнальные столики' },
  { value: 'BED', label: 'Кровати' },
  { value: 'TV_STAND', label: 'Тумбы под ТВ' },
  { value: 'WARDROBE', label: 'Хранение' },
  { value: 'DRESSER', label: 'Комоды' },
  { value: 'SHELF', label: 'Стеллажи' },
  { value: 'DESK', label: 'Письменные столы' },
  { value: 'LAMP', label: 'Свет' },
  { value: 'RUG', label: 'Ковры' },
  { value: 'DECOR', label: 'Декор' },
  { value: 'MATTRESS', label: 'Матрасы' },
  { value: 'MIRROR', label: 'Зеркала' },
  { value: 'BENCH', label: 'Банкетки' },
  { value: 'SHOE_CABINET', label: 'Обувницы' },
  { value: 'HANGER', label: 'Вешалки' },
];

const styles: { value: InteriorStyle; label: string }[] = [
  { value: 'MINIMALISM', label: 'Минимализм' },
  { value: 'SCANDI', label: 'Скандинавский' },
  { value: 'MODERN', label: 'Современный' },
  { value: 'LOFT', label: 'Лофт' },
  { value: 'ECO', label: 'Эко' },
  { value: 'CLASSIC', label: 'Классический' },
];

const colors = [
  { id: 'Бежевый', className: 'bg-[#e7d7c1]' },
  { id: 'Серый', className: 'bg-[#a3a3a3]' },
  { id: 'Дуб', className: 'bg-[#b58863]' },
  { id: 'Чёрный', className: 'bg-ink' },
  { id: 'Белый', className: 'bg-white' },
  { id: 'Латунь', className: 'bg-[#c9a66b]' },
  { id: 'Коричневый', className: 'bg-[#6b4a2b]' },
];

const brands = [
  'NordHome',
  'Form&Wood',
  'LightLab',
  'Mebelio',
  'CarpetCo',
  'UrbanCo',
];

type CatalogFiltersProps = {
  filters: CatalogFiltersState;
  activeFiltersCount: number;
  onFiltersChange: React.Dispatch<React.SetStateAction<CatalogFiltersState>>;
  onReset: () => void;
};

export function CatalogFilters({
  filters,
  activeFiltersCount,
  onFiltersChange,
  onReset,
}: CatalogFiltersProps) {
  const [open, setOpen] = useState(true);
  const pricePercent = getPricePercent(filters.maxPrice);
  const onlyStock = filters.stockStatuses.includes('IN_STOCK');

  const toggleArrayValue = <
    TKey extends keyof Pick<
      CatalogFiltersState,
      | 'roomTypes'
      | 'categories'
      | 'styles'
      | 'stockStatuses'
      | 'brands'
      | 'colors'
    >,
  >(
    key: TKey,
    value: CatalogFiltersState[TKey][number],
  ) => {
    onFiltersChange((prev) => {
      const list = prev[key];

      return {
        ...prev,
        [key]: list.includes(value as never)
          ? list.filter((item) => item !== value)
          : [...list, value],
        offset: 0,
      };
    });
  };

  return (
    <aside>
      <div className="lg:sticky lg:top-28">
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-2 font-semibold text-ink"
          >
            <SlidersHorizontal size={16} />
            Фильтры
            {activeFiltersCount > 0 ? (
              <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand px-1.5 text-xs text-white">
                {activeFiltersCount}
              </span>
            ) : null}
          </button>

          {activeFiltersCount > 0 ? (
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-ink-soft transition-colors hover:text-brand"
            >
              Сбросить
            </button>
          ) : null}
        </div>

        {open ? (
          <div className="space-y-8">
            <FilterGroup title="Тип комнаты">
              <CheckboxList
                values={roomTypes}
                activeValues={filters.roomTypes}
                onToggle={(value) => toggleArrayValue('roomTypes', value)}
              />
            </FilterGroup>

            <FilterGroup title="Категория">
              <CheckboxList
                values={categories}
                activeValues={filters.categories}
                onToggle={(value) => toggleArrayValue('categories', value)}
              />
            </FilterGroup>

            <FilterGroup title="Цена до">
              <div className="mb-4 text-2xl font-semibold tracking-tight text-ink">
                {formatMoney(filters.maxPrice)}
              </div>

              <div className="relative">
                <div className="h-1.5 rounded-pill bg-line/40">
                  <div
                    className="h-full rounded-pill bg-brand"
                    style={{ width: `${pricePercent}%` }}
                  />
                </div>

                <input
                  type="range"
                  min={CATALOG_PRICE_MIN}
                  max={CATALOG_PRICE_MAX}
                  step={1000}
                  value={filters.maxPrice}
                  onChange={(event) =>
                    onFiltersChange((prev) => ({
                      ...prev,
                      maxPrice: Number(event.target.value),
                      offset: 0,
                    }))
                  }
                  className="absolute inset-0 w-full cursor-pointer opacity-0"
                />

                <div
                  className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-brand bg-white shadow-soft"
                  style={{ left: `${pricePercent}%` }}
                />
              </div>

              <div className="mt-3 flex justify-between text-xs text-ink-soft">
                <span>{formatMoney(CATALOG_PRICE_MIN)}</span>
                <span>{formatMoney(CATALOG_PRICE_MAX)}</span>
              </div>
            </FilterGroup>

            <FilterGroup title="Стиль">
              <div className="flex flex-wrap gap-2">
                {styles.map((style) => {
                  const active = filters.styles.includes(style.value);

                  return (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => toggleArrayValue('styles', style.value)}
                      className={cn(
                        'rounded-pill border px-3 py-1.5 text-sm transition-all',
                        active
                          ? 'border-brand bg-brand-soft font-medium text-ink'
                          : 'border-line/60 text-ink-soft hover:border-ink hover:text-ink',
                      )}
                    >
                      {style.label}
                    </button>
                  );
                })}
              </div>
            </FilterGroup>

            <FilterGroup title="Цвет">
              <div className="flex flex-wrap gap-3">
                {colors.map((color) => {
                  const active = filters.colors.includes(color.id);

                  return (
                    <button
                      key={color.id}
                      type="button"
                      title={color.id}
                      onClick={() => toggleArrayValue('colors', color.id)}
                      className={cn(
                        'relative size-9 rounded-pill border border-line transition-all',
                        color.className,
                        active &&
                          'ring-2 ring-brand ring-offset-2 ring-offset-white',
                      )}
                    >
                      {active ? (
                        <Check className="absolute inset-0 m-auto size-4 text-ink" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </FilterGroup>

            <FilterGroup title="Бренд">
              <CheckboxList
                values={brands.map((brand) => ({
                  value: brand,
                  label: brand,
                }))}
                activeValues={filters.brands}
                onToggle={(value) => toggleArrayValue('brands', value)}
              />
            </FilterGroup>

            <button
              type="button"
              onClick={() =>
                onFiltersChange((prev) => ({
                  ...prev,
                  stockStatuses: onlyStock ? [] : ['IN_STOCK' as StockStatus],
                  offset: 0,
                }))
              }
              className="flex w-full items-center justify-between rounded-md border border-line/60 p-4 transition-colors hover:border-ink"
            >
              <span className="text-sm font-medium text-ink">
                Только в наличии
              </span>

              <span
                className={cn(
                  'relative h-6 w-10 rounded-pill transition-colors',
                  onlyStock ? 'bg-brand' : 'bg-line',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 size-5 rounded-pill bg-white shadow transition-all',
                    onlyStock ? 'left-[18px]' : 'left-0.5',
                  )}
                />
              </span>
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-ink">
        {title}
      </h3>

      {children}
    </section>
  );
}

function CheckboxList<TValue extends string>({
  values,
  activeValues,
  onToggle,
}: {
  values: { value: TValue; label: string }[];
  activeValues: TValue[];
  onToggle: (value: TValue) => void;
}) {
  return (
    <div className="space-y-2">
      {values.map((item) => {
        const active = activeValues.includes(item.value);

        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onToggle(item.value)}
            className="group flex w-full items-center gap-3 text-left"
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-xs border transition-all',
                active
                  ? 'border-brand bg-brand'
                  : 'border-line group-hover:border-ink',
              )}
            >
              {active ? <Check size={12} className="text-white" /> : null}
            </span>

            <span
              className={cn(
                'text-sm transition-colors',
                active
                  ? 'font-medium text-ink'
                  : 'text-ink-soft group-hover:text-ink',
              )}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
