import type { Cart, CartItem } from '@/shared/api/types';

export type CartGroup = {
  key: string;
  type: 'design-project' | 'catalog';
  title: string;
  subtitle: string;
  imageUrl: string | null;
  roomProjectId: string | null;
  designVariantId: string | null;
  items: CartItem[];
  totalAmount: number;
};

export function isRealCart(value: unknown): value is Cart {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'items' in value &&
    Array.isArray((value as Cart).items)
  );
}

export function formatMoney(value: number | null | undefined) {
  return `${new Intl.NumberFormat('ru-RU').format(value ?? 0)} ₽`;
}

export function getCartItemsCount(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function getCartItemsTotal(items: CartItem[]) {
  return items.reduce((sum, item) => {
    return sum + item.priceSnapshot * item.quantity;
  }, 0);
}

export function getDeliveryPrice(totalAmount: number) {
  return totalAmount >= 50_000 ? 0 : 990;
}

export function getCartGroups(items: CartItem[]): CartGroup[] {
  const map = new Map<string, CartItem[]>();

  for (const item of items) {
    const key = item.roomProjectId
      ? `project:${item.roomProjectId}:${item.designVariantId ?? 'none'}`
      : 'catalog';

    const group = map.get(key) ?? [];
    group.push(item);
    map.set(key, group);
  }

  return Array.from(map.entries()).map(([key, groupItems]) => {
    const first = groupItems[0];

    if (first.roomProjectId) {
      return {
        key,
        type: 'design-project',
        title:
          first.roomProject?.title ??
          first.designVariant?.title ??
          'Дизайн-проект',
        subtitle: [first.roomProject?.roomType, first.roomProject?.style]
          .filter(Boolean)
          .join(' · '),
        imageUrl: first.designVariant?.imageUrl ?? first.imageSnapshot ?? null,
        roomProjectId: first.roomProjectId,
        designVariantId: first.designVariantId,
        items: groupItems,
        totalAmount: getCartItemsTotal(groupItems),
      };
    }

    return {
      key,
      type: 'catalog',
      title: 'Без привязки к проекту',
      subtitle: 'Товары из каталога',
      imageUrl: null,
      roomProjectId: null,
      designVariantId: null,
      items: groupItems,
      totalAmount: getCartItemsTotal(groupItems),
    };
  });
}

export function getProductImage(item: CartItem) {
  return item.imageSnapshot ?? item.product?.imageUrls?.[0] ?? null;
}

export function getProductSubtitle(item: CartItem) {
  const parts = [item.product?.color, item.product?.material].filter(Boolean);

  return parts.length > 0 ? parts.join(' · ') : (item.product?.category ?? '');
}

export function getItemOldPrice(item: CartItem) {
  if (!item.product?.oldPrice) {
    return null;
  }

  return item.product.oldPrice * item.quantity;
}
