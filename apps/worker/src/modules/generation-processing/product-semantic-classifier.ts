import type { Product } from '@roomvi/database';
import { ProductCategory } from '@roomvi/database';

export type ProductFunctionRole =
  | 'ANCHOR'
  | 'STORAGE'
  | 'SURFACE'
  | 'SEATING'
  | 'LIGHTING'
  | 'TEXTILE'
  | 'DECOR'
  | 'OTHER';

export type SceneRole =
  | 'PRIMARY_ANCHOR'
  | 'SECONDARY_ANCHOR'
  | 'STORAGE'
  | 'BEDSIDE'
  | 'SURFACE'
  | 'TASK_LIGHTING'
  | 'AMBIENT_LIGHTING'
  | 'ACCENT_SEATING'
  | 'TEXTILE'
  | 'WALL_ACCENT'
  | 'DECOR';

export type ProductPlacement =
  | 'CEILING'
  | 'WALL'
  | 'FLOOR'
  | 'TABLETOP'
  | 'FREESTANDING'
  | 'BUILT_IN'
  | 'UNKNOWN';

export type ProductSemanticProfile = {
  functionRole: ProductFunctionRole;
  placement: ProductPlacement;
  subtype?: string;
};

const STORAGE_CATEGORIES = new Set<ProductCategory>([
  ProductCategory.WARDROBE,
  ProductCategory.DRESSER,
  ProductCategory.TV_STAND,
  ProductCategory.SHELF,
]);

const SURFACE_CATEGORIES = new Set<ProductCategory>([
  ProductCategory.COFFEE_TABLE,
  ProductCategory.TABLE,
  ProductCategory.DESK,
]);

const SEATING_CATEGORIES = new Set<ProductCategory>([
  ProductCategory.ARMCHAIR,
  ProductCategory.CHAIR,
  ProductCategory.BENCH,
]);

export function classifyProductSemantics(
  product: Pick<Product, 'category' | 'title' | 'description'>,
): ProductSemanticProfile {
  const text = `${product.title} ${product.description ?? ''}`.toLocaleLowerCase();
  const containsAny = (markers: string[]) =>
    markers.some((marker) => text.includes(marker));

  if (product.category === ProductCategory.LAMP) {
    if (containsAny(['люстр', 'chandelier'])) {
      return {
        functionRole: 'LIGHTING',
        placement: 'CEILING',
        subtype: 'CHANDELIER',
      };
    }
    if (containsAny(['подвес', 'pendant', 'suspension'])) {
      return {
        functionRole: 'LIGHTING',
        placement: 'CEILING',
        subtype: 'PENDANT',
      };
    }
    if (containsAny(['торшер', 'напольн', 'floor lamp'])) {
      return {
        functionRole: 'LIGHTING',
        placement: 'FLOOR',
        subtype: 'FLOOR_LAMP',
      };
    }
    if (containsAny(['настольн', 'table lamp'])) {
      return {
        functionRole: 'LIGHTING',
        placement: 'TABLETOP',
        subtype: 'TABLE_LAMP',
      };
    }
    if (containsAny(['бра', 'wall lamp', 'wall light', 'sconce'])) {
      return {
        functionRole: 'LIGHTING',
        placement: 'WALL',
        subtype: 'WALL_LAMP',
      };
    }
    if (
      containsAny([
        'потолочн',
        'ceiling lamp',
        'ceiling light',
        'ceiling fixture',
      ])
    ) {
      return {
        functionRole: 'LIGHTING',
        placement: 'CEILING',
        subtype: 'CEILING_LIGHT',
      };
    }
    return {
      functionRole: 'LIGHTING',
      placement: 'UNKNOWN',
      subtype: 'GENERIC_LAMP',
    };
  }
  if (product.category === ProductCategory.BED) {
    return {
      functionRole: 'ANCHOR',
      placement: 'FREESTANDING',
      subtype: 'BED',
    };
  }
  if (product.category === ProductCategory.SOFA) {
    return {
      functionRole: 'ANCHOR',
      placement: 'FREESTANDING',
      subtype: 'SOFA',
    };
  }
  if (STORAGE_CATEGORIES.has(product.category)) {
    return {
      functionRole: 'STORAGE',
      placement: 'FREESTANDING',
      subtype: product.category,
    };
  }
  if (SURFACE_CATEGORIES.has(product.category)) {
    return {
      functionRole: 'SURFACE',
      placement: 'FREESTANDING',
      subtype: product.category,
    };
  }
  if (SEATING_CATEGORIES.has(product.category)) {
    return {
      functionRole: 'SEATING',
      placement: 'FREESTANDING',
      subtype: product.category,
    };
  }
  if (product.category === ProductCategory.RUG) {
    return {
      functionRole: 'TEXTILE',
      placement: 'FLOOR',
      subtype: 'RUG',
    };
  }
  if (product.category === ProductCategory.DECOR) {
    return {
      functionRole: 'DECOR',
      placement: 'UNKNOWN',
      subtype: 'DECOR',
    };
  }

  return {
    functionRole: 'OTHER',
    placement: 'UNKNOWN',
    subtype: product.category,
  };
}

export function classifyProductSceneRoles(
  product: Pick<Product, 'category' | 'title' | 'description'>,
): SceneRole[] {
  const semantics = classifyProductSemantics(product);

  if (semantics.functionRole === 'LIGHTING') {
    if (['TABLE_LAMP', 'FLOOR_LAMP'].includes(semantics.subtype ?? '')) {
      return ['TASK_LIGHTING'];
    }
    if (semantics.subtype === 'WALL_LAMP') {
      return ['TASK_LIGHTING', 'AMBIENT_LIGHTING'];
    }
    return ['AMBIENT_LIGHTING'];
  }

  switch (product.category) {
    case ProductCategory.BED:
    case ProductCategory.SOFA:
      return ['PRIMARY_ANCHOR'];
    case ProductCategory.DRESSER:
      return ['STORAGE', 'BEDSIDE'];
    case ProductCategory.WARDROBE:
    case ProductCategory.TV_STAND:
    case ProductCategory.SHELF:
    case ProductCategory.SHOE_CABINET:
    case ProductCategory.HANGER:
      return ['STORAGE'];
    case ProductCategory.COFFEE_TABLE:
    case ProductCategory.TABLE:
    case ProductCategory.DESK:
      return ['SURFACE'];
    case ProductCategory.ARMCHAIR:
    case ProductCategory.CHAIR:
    case ProductCategory.BENCH:
      return ['ACCENT_SEATING'];
    case ProductCategory.RUG:
      return ['TEXTILE'];
    case ProductCategory.MIRROR:
      return ['WALL_ACCENT'];
    case ProductCategory.DECOR:
      return ['DECOR'];
    default:
      return [];
  }
}
