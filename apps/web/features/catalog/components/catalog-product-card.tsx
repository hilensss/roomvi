'use client';

import Link from 'next/link';
import { Heart, ShoppingCart, Star } from 'lucide-react';
import { SafeImage } from '@/shared/ui/safe-image';
import type { Product } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';
import { useAddCatalogProductToCartMutation } from '../api/catalog-queries';
import {
  formatMoney,
  getProductDiscountPercent,
  getProductImage,
  getProductOldPrice,
  getProductSubtitle,
  isProductInStock,
} from '../lib/catalog.helpers';

type CatalogProductCardProps = {
  product: Product;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

export function CatalogProductCard({
  product,
  isFavorite,
  onToggleFavorite,
}: CatalogProductCardProps) {
  const addToCartMutation = useAddCatalogProductToCartMutation();

  const imageUrl = getProductImage(product);
  const oldPrice = getProductOldPrice(product);
  const discount = getProductDiscountPercent(product);
  const inStock = isProductInStock(product);

  return (
    <Link href={`/catalog/${product.id}`} className="group block">
      <div className="relative mb-4 aspect-[4/5] overflow-hidden rounded-lg bg-line/20">
        {imageUrl ? (
          <SafeImage
            src={imageUrl}
            alt={product.title}
            fill
            className={cn(
              'object-cover transition-all duration-500 group-hover:scale-105',
              !inStock && 'grayscale opacity-70',
            )}
            sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-line/20 px-6 text-center text-sm text-ink-soft">
            Нет изображения
          </div>
        )}

        <div className="absolute left-4 top-4 flex flex-col gap-2">
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

        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            'absolute right-4 top-4 flex size-10 items-center justify-center rounded-pill backdrop-blur transition-all',
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

        <div className="absolute inset-x-4 bottom-4 translate-y-2 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
          <button
            type="button"
            disabled={!inStock || addToCartMutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              addToCartMutation.mutate({
                productId: product.id,
                quantity: 1,
              });
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-dark py-3 text-white transition-colors hover:bg-brand disabled:pointer-events-none disabled:opacity-60"
          >
            <ShoppingCart size={16} />
            <span className="text-sm font-medium">
              {addToCartMutation.isPending ? 'Добавляем...' : 'В корзину'}
            </span>
          </button>
        </div>
      </div>

      <div className="px-1">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="truncate text-xs text-ink-soft">
            {product.supplierId}
          </span>

          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-soft">
            <Star className="size-3 fill-brand text-brand" />
            4.8 <span className="text-line">·</span> 142
          </span>
        </div>

        <h3 className="mb-1 text-base font-medium leading-snug text-ink">
          {product.title}
        </h3>

        <p className="mb-2 truncate text-sm text-ink-soft">
          {getProductSubtitle(product) || product.category}
        </p>

        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-ink">
            {formatMoney(product.price)}
          </span>

          {oldPrice ? (
            <span className="text-sm text-line line-through">
              {formatMoney(oldPrice)}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
