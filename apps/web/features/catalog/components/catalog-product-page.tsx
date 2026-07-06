'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Heart,
  Package,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react';
import { SafeImage } from '@/shared/ui/safe-image';
import { cn } from '@/shared/lib/cn';
import type { Product } from '@/shared/api/types';
import {
  formatMoney,
  getProductDiscountPercent,
  getProductImage,
  getProductOldPrice,
  getProductSubtitle,
  isProductInStock,
} from '../lib/catalog.helpers';
import {
  useAddCatalogProductToCartMutation,
  useCatalogProductQuery,
} from '../api/catalog-queries';

type CatalogProductPageProps = {
  productId: string;
};

export function CatalogProductPage({ productId }: CatalogProductPageProps) {
  const productQuery = useCatalogProductQuery(productId);

  if (productQuery.isLoading) {
    return (
      <div className="rv-container-wide py-12 text-ink-soft">
        Загружаем товар...
      </div>
    );
  }

  if (productQuery.isError || !productQuery.data) {
    return (
      <div className="rv-container flex min-h-[60vh] items-center justify-center py-16">
        <div className="max-w-xl rounded-card border border-line/60 bg-white p-8 text-center shadow-soft">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">
            Товар не найден
          </h1>

          <p className="mt-3 text-ink-soft">
            Возможно, он уже не продаётся или ссылка устарела.
          </p>

          <Link
            href="/catalog"
            className="mt-8 inline-flex items-center gap-2 rounded-pill bg-dark px-6 py-3 text-white transition hover:bg-brand"
          >
            <ArrowLeft size={16} />В каталог
          </Link>
        </div>
      </div>
    );
  }

  return <CatalogProductContent product={productQuery.data} />;
}

function CatalogProductContent({ product }: { product: Product }) {
  const addToCartMutation = useAddCatalogProductToCartMutation();

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);

  const gallery = getProductGallery(product);
  const activeImage = gallery[activeImageIndex] ?? getProductImage(product);
  const oldPrice = getProductOldPrice(product);
  const discount = getProductDiscountPercent(product);
  const inStock = isProductInStock(product);
  const total = product.price * quantity;
  const specs = getProductSpecs(product);

  const addToCart = () => {
    addToCartMutation.mutate({
      productId: product.id,
      quantity,
    });
  };

  return (
    <div className="min-h-full bg-white">
      <ProductBreadcrumbs product={product} />

      <div className="rv-container-wide grid gap-12 py-12 lg:grid-cols-[1.25fr_0.85fr]">
        <section>
          <div className="grid gap-4 sm:grid-cols-[88px_1fr]">
            <div className="order-2 flex gap-3 sm:order-1 sm:flex-col">
              {gallery.map((src, index) => (
                <button
                  key={`${src}:${index}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                  className={cn(
                    'relative size-20 overflow-hidden rounded-md border-2 transition sm:size-[88px]',
                    activeImageIndex === index
                      ? 'border-brand'
                      : 'border-transparent hover:border-line',
                  )}
                >
                  <SafeImage
                    src={src}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="88px"
                  />
                </button>
              ))}
            </div>

            <div className="relative order-1 aspect-[4/3] overflow-hidden rounded-card bg-line/20 sm:order-2">
              {activeImage ? (
                <SafeImage
                  src={activeImage}
                  alt={product.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(min-width: 1024px) 55vw, 100vw"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-ink-soft">
                  Нет изображения
                </div>
              )}

              <div className="absolute left-5 top-5 flex flex-col gap-2">
                {discount ? (
                  <span className="rounded-pill bg-brand px-3 py-1 text-xs font-medium text-white">
                    −{discount}%
                  </span>
                ) : null}

                {!inStock ? (
                  <span className="rounded-pill bg-white/95 px-3 py-1 text-xs text-ink-soft">
                    Нет в наличии
                  </span>
                ) : null}
              </div>

              <div className="absolute right-5 top-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setIsFavorite((value) => !value)}
                  className={cn(
                    'flex size-11 items-center justify-center rounded-pill backdrop-blur transition-all',
                    isFavorite
                      ? 'bg-brand text-white'
                      : 'bg-white/90 text-ink hover:bg-white',
                  )}
                  aria-label={
                    isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'
                  }
                >
                  <Heart className={cn('size-4', isFavorite && 'fill-white')} />
                </button>

                <button
                  type="button"
                  className="flex size-11 items-center justify-center rounded-pill bg-white/90 text-ink backdrop-blur transition hover:bg-white"
                  aria-label="Поделиться"
                >
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="lg:sticky lg:top-28 lg:self-start">
          <div className="mb-3 flex items-center gap-2 text-sm text-ink-soft">
            <span>{product.supplierId}</span>
            <span className="text-line">·</span>
            <span className="inline-flex items-center gap-1">
              <Star className="size-3.5 fill-brand text-brand" />
              4.8
              <span className="text-line">·</span>
              142 отзыва
            </span>
          </div>

          <h1 className="mb-6 text-[clamp(2rem,3.5vw,2.75rem)] font-semibold leading-tight tracking-tight text-ink">
            {product.title}
          </h1>

          <div className="mb-8 flex items-baseline gap-4">
            <span className="text-[clamp(2rem,4vw,2.75rem)] font-semibold tracking-tight text-ink">
              {formatMoney(product.price)}
            </span>

            {oldPrice ? (
              <span className="text-xl text-line line-through">
                {formatMoney(oldPrice)}
              </span>
            ) : null}
          </div>

          <div
            className={cn(
              'mb-8 inline-flex items-center gap-2 rounded-pill px-4 py-2',
              inStock ? 'bg-brand-soft text-ink' : 'bg-line/30 text-ink-soft',
            )}
          >
            <span
              className={cn(
                'size-2 rounded-pill',
                inStock ? 'bg-brand' : 'bg-line',
              )}
            />
            <span className="text-sm font-medium">
              {inStock ? 'В наличии · готов к отправке' : 'Нет в наличии'}
            </span>
          </div>

          <div className="mb-4 flex items-stretch gap-3">
            <div className="flex items-center overflow-hidden rounded-pill border border-line/60">
              <button
                type="button"
                onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                className="flex size-12 items-center justify-center text-ink transition hover:bg-line/20"
              >
                −
              </button>

              <span className="w-10 text-center font-medium text-ink">
                {quantity}
              </span>

              <button
                type="button"
                onClick={() => setQuantity((value) => value + 1)}
                className="flex size-12 items-center justify-center text-ink transition hover:bg-line/20"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!inStock || addToCartMutation.isPending}
              onClick={addToCart}
              className="group inline-flex flex-1 items-center justify-center gap-3 rounded-pill bg-dark py-3 pl-6 pr-3 text-white shadow-lg transition-all hover:bg-brand disabled:pointer-events-none disabled:opacity-50"
            >
              <ShoppingCart size={16} />
              <span className="font-medium">
                {addToCartMutation.isPending
                  ? 'Добавляем...'
                  : `В корзину · ${formatMoney(total)}`}
              </span>

              <span className="flex size-9 items-center justify-center rounded-pill bg-brand transition-colors group-hover:bg-white">
                <ArrowRight className="size-4 text-white transition-colors group-hover:text-brand" />
              </span>
            </button>
          </div>

          {addToCartMutation.isError ? (
            <div className="mb-4 rounded-md bg-brand-soft px-4 py-3 text-sm text-brand">
              {addToCartMutation.error.message}
            </div>
          ) : null}

          {addToCartMutation.isSuccess ? (
            <div className="mb-4 rounded-md bg-brand-soft px-4 py-3 text-sm text-ink">
              Товар добавлен в корзину.
              <Link href="/cart" className="ml-1 font-medium text-brand">
                Перейти
              </Link>
            </div>
          ) : null}

          <button
            type="button"
            className="w-full rounded-pill border border-line py-3 text-ink transition hover:border-ink"
          >
            Купить в один клик
          </button>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { icon: Truck, title: 'Доставка', detail: '5–10 дней' },
              { icon: Package, title: 'Сборка', detail: 'По желанию' },
              { icon: ShieldCheck, title: 'Гарантия', detail: '24 месяца' },
            ].map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-md border border-line/40 bg-white p-4 text-center"
                >
                  <Icon className="mx-auto mb-2 size-5 text-brand" />
                  <div className="text-xs text-ink-soft">{item.title}</div>
                  <div className="text-sm font-medium text-ink">
                    {item.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="rv-container-wide grid gap-10 pb-20 lg:grid-cols-2">
        <div className="rounded-card border border-line/60 p-8 md:p-10">
          <p className="rv-eyebrow mb-4">Описание</p>

          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-ink">
            О товаре
          </h2>

          <p className="leading-7 text-ink-soft">
            {getProductDescription(product)}
          </p>
        </div>

        <div className="rounded-card border border-line/60 p-8 md:p-10">
          <p className="rv-eyebrow mb-4">Характеристики</p>

          <h2 className="mb-5 text-3xl font-semibold tracking-tight text-ink">
            Параметры
          </h2>

          <div>
            {specs.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 border-b border-line/40 py-3.5 last:border-0"
              >
                <span className="text-sm text-ink-soft">{row.label}</span>
                <span className="text-right text-sm font-medium text-ink">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ProductBreadcrumbs({ product }: { product: Product }) {
  return (
    <div className="border-b border-line/40">
      <div className="rv-container-wide flex flex-wrap items-center gap-2 py-5 text-sm text-ink-soft">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1 transition hover:text-brand"
        >
          <ArrowLeft size={14} />
          Каталог
        </Link>

        <ChevronRight size={14} className="text-line" />

        <Link href="/catalog" className="transition hover:text-brand">
          {product.category}
        </Link>

        <ChevronRight size={14} className="text-line" />

        <span className="font-medium text-ink">{product.title}</span>
      </div>
    </div>
  );
}

function getProductGallery(product: Product) {
  if (product.imageUrls?.length) {
    return product.imageUrls;
  }

  const image = getProductImage(product);

  return image ? [image] : [];
}

function getProductDescription(product: Product) {
  if (product.description) {
    return product.description;
  }

  const subtitle = getProductSubtitle(product);

  return `${product.title} — это товар из каталога Roomvi${
    subtitle ? `: ${subtitle.toLowerCase()}` : ''
  }. Его можно добавить в корзину отдельно или использовать в составе AI-дизайна интерьера.`;
}

function getProductSpecs(product: Product) {
  return [
    {
      label: 'Категория',
      value: product.category,
    },
    {
      label: 'Стиль',
      value: product.styleTags?.join(', ') || '—',
    },
    {
      label: 'Комнаты',
      value: product.roomTypes?.join(', ') || '—',
    },
    {
      label: 'Цвет',
      value: product.color ?? '—',
    },
    {
      label: 'Материал',
      value: product.material ?? '—',
    },
    {
      label: 'Ширина',
      value: product.widthCm ? `${product.widthCm} см` : '—',
    },
    {
      label: 'Высота',
      value: product.heightCm ? `${product.heightCm} см` : '—',
    },
    {
      label: 'Глубина',
      value: product.depthCm ? `${product.depthCm} см` : '—',
    },
    {
      label: 'Наличие',
      value: product.stockStatus,
    },
  ];
}
