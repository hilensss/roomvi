'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, Package, ShoppingCart, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getDesignVariant, addDesignVariantToCart } from '../api/designs-api';
import { formatMoney } from '@/features/generation/lib/generation.helpers';
import { SafeImage } from '@/shared/ui/safe-image';

type DesignDetailPageProps = {
  designVariantId: string;
};

export function DesignDetailPage({ designVariantId }: DesignDetailPageProps) {
  const router = useRouter();

  const variantQuery = useQuery({
    queryKey: ['design-variant', designVariantId],
    queryFn: () => getDesignVariant(designVariantId),
  });

  const addToCartMutation = useMutation({
    mutationFn: () => addDesignVariantToCart(designVariantId),
    onSuccess: () => {
      router.push('/cart');
    },
  });

  if (variantQuery.isLoading) {
    return (
      <div className="rv-container py-12 text-ink-soft">
        Загружаем дизайн...
      </div>
    );
  }

  if (variantQuery.isError || !variantQuery.data) {
    return (
      <div className="rv-container py-12">
        <div className="rounded-card border border-line/60 p-8">
          <h1 className="text-2xl font-semibold text-ink">
            Не удалось открыть дизайн
          </h1>
          <p className="mt-2 text-ink-soft">
            {variantQuery.error?.message ?? 'Попробуйте вернуться к вариантам.'}
          </p>
        </div>
      </div>
    );
  }

  const variant = variantQuery.data;
  const products = variant.products ?? [];
  const totalPrice =
    variant.totalPrice ??
    products.reduce((sum, item) => sum + item.product.price, 0);

  return (
    <div className="min-h-full bg-white">
      <div className="rv-container-wide py-6">
        <Link
          href={`/generation/${variant.generationJobId}/result`}
          className="mb-4 inline-flex items-center gap-2 text-ink-soft transition-colors hover:text-brand"
        >
          <ChevronLeft size={20} />
          Вернуться к вариантам
        </Link>

        <div className="mb-4">
          <h1 className="mb-2 text-section-title text-ink">
            {variant.title ?? 'Дизайн интерьера'}
          </h1>

          <p className="max-w-3xl text-body-lg text-ink-soft">
            {variant.description ??
              'Фотореалистичный дизайн с товарами из каталога Roomvi.'}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_0.9fr]">
          <div>
            <div className="sticky top-28">
              <div className="overflow-hidden rounded-card bg-white shadow-card">
                <Image
                  src={variant.imageUrl}
                  alt={variant.title ?? 'Дизайн комнаты'}
                  width={1200}
                  height={900}
                  className="aspect-[4/3] w-full object-cover"
                />
              </div>

              <div className="mt-6 rounded-card bg-white p-6 shadow-soft">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <Stat label="Товаров" value={String(products.length)} />
                  <Stat
                    label="Общая стоимость"
                    value={formatMoney(totalPrice)}
                    accent
                  />
                  <Stat label="Вариант" value="AI" />
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div className="mb-6 rounded-card bg-white p-6 shadow-card">
              <h2 className="mb-4 text-2xl font-semibold text-ink">
                Товары в этом дизайне
              </h2>

              <p className="mb-6 text-ink-soft">
                Все товары от проверенных поставщиков
              </p>

              <button
                type="button"
                onClick={() => addToCartMutation.mutate()}
                disabled={addToCartMutation.isPending}
                className="mb-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-pill bg-brand px-6 text-sm font-semibold text-white transition hover:bg-dark disabled:pointer-events-none disabled:opacity-60"
              >
                <ShoppingCart size={20} />
                {addToCartMutation.isPending
                  ? 'Добавляем...'
                  : 'Добавить всё в корзину'}
              </button>

              {addToCartMutation.isError ? (
                <div className="mb-4 rounded-md bg-brand-soft px-4 py-3 text-sm text-brand">
                  {addToCartMutation.error.message}
                </div>
              ) : null}

              <div className="flex items-start gap-3 rounded-md bg-surface-muted p-4 text-sm text-ink-soft">
                <Truck className="mt-0.5 shrink-0 text-brand" size={20} />
                <span>
                  Доставка рассчитывается индивидуально для каждого товара.
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {products.map((item) => (
                <ProductInDesignCard key={item.id} item={item} />
              ))}
            </div>

            <div className="mt-6 rounded-card bg-white p-6 shadow-card">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-lg font-semibold text-ink">Итого</span>
                <span className="text-3xl font-bold text-brand">
                  {formatMoney(totalPrice)}
                </span>
              </div>

              <div className="mb-4 space-y-2 text-sm text-ink-soft">
                <div className="flex justify-between">
                  <span>Товары ({products.length} шт)</span>
                  <span>{formatMoney(totalPrice)}</span>
                </div>

                <div className="flex justify-between">
                  <span>Доставка</span>
                  <span>Рассчитывается отдельно</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 text-sm text-ink-soft">{label}</div>
      <div
        className={
          accent
            ? 'text-2xl font-bold text-brand'
            : 'text-2xl font-bold text-ink'
        }
      >
        {value}
      </div>
    </div>
  );
}

function ProductInDesignCard({
  item,
}: {
  item: {
    id: string;
    product: {
      title: string;
      material: string | null;
      price: number;
      imageUrls: string[];
      widthCm: number | null;
      depthCm: number | null;
      heightCm: number | null;
      stockStatus: string;
    };
  };
}) {
  const product = item.product;
  const imageUrl = product.imageUrls[0] ?? '/placeholder-product.png';

  const dimensions = [product.widthCm, product.depthCm, product.heightCm]
    .filter(Boolean)
    .join(' × ');

  const inStock = product.stockStatus === 'IN_STOCK';

  return (
    <article className="rounded-lg bg-white p-4 shadow-soft transition-shadow hover:shadow-card">
      <div className="flex gap-4">
        <div className="relative size-24 shrink-0 overflow-hidden rounded-md bg-surface-muted">
          <SafeImage
            src={imageUrl}
            alt={product.title}
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="mb-1 line-clamp-2 font-semibold text-ink">
            {product.title}
          </h3>

          <p className="mb-2 text-sm text-ink-soft">
            {product.material ?? 'Материал не указан'}
          </p>

          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="mb-1 text-lg font-bold text-brand">
                {formatMoney(product.price)}
              </div>

              <div className="text-xs text-ink-soft">
                {dimensions ? `${dimensions} см` : 'Размеры не указаны'}
              </div>
            </div>

            <div
              className={
                inStock
                  ? 'inline-flex items-center gap-1 rounded-pill bg-green-100 px-2 py-1 text-xs text-green-700'
                  : 'inline-flex items-center gap-1 rounded-pill bg-orange-100 px-2 py-1 text-xs text-orange-700'
              }
            >
              {inStock ? <Package size={12} /> : <Truck size={12} />}
              {inStock ? 'В наличии' : 'Под заказ'}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
