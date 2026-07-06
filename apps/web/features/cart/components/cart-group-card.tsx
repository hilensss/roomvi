'use client';

import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';
import { SafeImage } from '@/shared/ui/safe-image';
import type { CartGroup } from '../lib/cart.helpers';
import { formatMoney } from '../lib/cart.helpers';
import { CartItemRow } from './cart-item-row';

type CartGroupCardProps = {
  group: CartGroup;
};

export function CartGroupCard({ group }: CartGroupCardProps) {
  return (
    <section className="overflow-hidden rounded-card border border-line/60">
      {group.type === 'design-project' ? (
        <DesignProjectGroupHeader group={group} />
      ) : (
        <CatalogGroupHeader group={group} />
      )}

      <div className="divide-y divide-line/40">
        {group.items.map((item) => (
          <CartItemRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function DesignProjectGroupHeader({ group }: { group: CartGroup }) {
  const href = group.designVariantId
    ? `/designs/${group.designVariantId}`
    : '/cart';

  return (
    <Link
      href={href}
      className="flex items-center gap-4 bg-dark p-5 text-white transition-colors hover:bg-dark-soft"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-white/10">
        {group.imageUrl ? (
          <SafeImage
            src={group.imageUrl}
            alt={group.title}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs uppercase tracking-[0.2em] text-brand">
          Дизайн-проект
        </div>

        <div className="truncate font-semibold">{group.title}</div>

        <div className="text-sm text-line">
          {group.subtitle || 'Проект Roomvi'}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="text-xs uppercase tracking-[0.2em] text-line">
          Итого
        </div>

        <div className="text-lg font-semibold">
          {formatMoney(group.totalAmount)}
        </div>
      </div>

      <ArrowRight className="shrink-0 text-brand" size={20} />
    </Link>
  );
}

function CatalogGroupHeader({ group }: { group: CartGroup }) {
  return (
    <div className="flex items-center gap-4 border-b border-line/40 bg-line/15 p-5">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-line/50 bg-white">
        <Package className="text-ink-soft" size={20} />
      </div>

      <div className="flex-1">
        <div className="mb-1 text-xs uppercase tracking-[0.2em] text-ink-soft">
          Из каталога
        </div>

        <div className="font-medium text-ink">{group.title}</div>
      </div>

      <div className="text-right">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-soft">
          Итого
        </div>

        <div className="text-lg font-semibold text-ink">
          {formatMoney(group.totalAmount)}
        </div>
      </div>
    </div>
  );
}
