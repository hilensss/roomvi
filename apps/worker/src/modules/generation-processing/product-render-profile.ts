import type { Product } from '@roomvi/database';
import { ProductCategory } from '@roomvi/database';
import { classifyProductSemantics } from './product-semantic-classifier.js';

export type ProductRenderPriority = 'HERO' | 'STRUCTURAL' | 'SUPPORT' | 'SOFT';

export type ProductRenderProfile = {
  priority: ProductRenderPriority;
  placement: string;
  subtype: string;
  shapeHint: string;
  mustBeVisible: boolean;
  exactReferenceFidelity: boolean;
  allowDuplicate: false;
};

const STRUCTURAL_CATEGORIES = new Set<ProductCategory>([
  ProductCategory.ARMCHAIR,
  ProductCategory.CHAIR,
  ProductCategory.COFFEE_TABLE,
  ProductCategory.TABLE,
  ProductCategory.TV_STAND,
  ProductCategory.WARDROBE,
  ProductCategory.DRESSER,
  ProductCategory.SHELF,
  ProductCategory.DESK,
  ProductCategory.BENCH,
  ProductCategory.SHOE_CABINET,
  ProductCategory.HANGER,
  ProductCategory.MIRROR,
]);

export function getProductRenderProfile(
  product: Pick<
    Product,
    'category' | 'title' | 'description' | 'widthCm' | 'heightCm' | 'depthCm'
  >,
): ProductRenderProfile {
  const semantics = classifyProductSemantics(product);
  const text = `${product.title} ${product.description ?? ''}`.toLocaleLowerCase();

  const priority: ProductRenderPriority =
    product.category === ProductCategory.SOFA ||
    product.category === ProductCategory.BED
      ? 'HERO'
      : STRUCTURAL_CATEGORIES.has(product.category)
        ? 'STRUCTURAL'
        : product.category === ProductCategory.RUG ||
            product.category === ProductCategory.LAMP
          ? 'SUPPORT'
          : 'SOFT';

  return {
    priority,
    placement: semantics.placement,
    subtype: semantics.subtype ?? product.category,
    shapeHint: getShapeHint(product.category, text),
    mustBeVisible: priority !== 'SOFT',
    exactReferenceFidelity: priority === 'HERO' || priority === 'STRUCTURAL',
    allowDuplicate: false,
  };
}

export function getRenderPriorityRank(priority: ProductRenderPriority) {
  switch (priority) {
    case 'HERO':
      return 0;
    case 'STRUCTURAL':
      return 1;
    case 'SUPPORT':
      return 2;
    case 'SOFT':
      return 3;
  }
}

function getShapeHint(category: ProductCategory, text: string): string {
  if (category === ProductCategory.SHELF) {
    if (/секци|куб|grid|cube|open/.test(text)) {
      return 'OPEN_GRID_SHELVING';
    }
    return 'PRESERVE_REFERENCE_SHELF_GEOMETRY';
  }

  if (
    category === ProductCategory.COFFEE_TABLE ||
    category === ProductCategory.TABLE
  ) {
    if (/круг|round|cylind|цилинд/.test(text)) return 'ROUND_OR_CYLINDRICAL';
    if (/овал|oval/.test(text)) return 'OVAL';
    return 'PRESERVE_REFERENCE_TABLE_GEOMETRY';
  }

  if (category === ProductCategory.ARMCHAIR || category === ProductCategory.CHAIR) {
    return 'PRESERVE_REFERENCE_SEATING_SILHOUETTE';
  }

  if (category === ProductCategory.SOFA) {
    return 'PRESERVE_REFERENCE_SOFA_SILHOUETTE_AND_SECTION_COUNT';
  }

  if (category === ProductCategory.BED) {
    return 'PRESERVE_REFERENCE_BED_FRAME_AND_HEADBOARD';
  }

  if (category === ProductCategory.RUG) {
    return 'PRESERVE_REFERENCE_RUG_SHAPE_AND_PROPORTIONS';
  }

  if (category === ProductCategory.LAMP) {
    return 'PRESERVE_REFERENCE_FIXTURE_SHAPE';
  }

  return `PRESERVE_REFERENCE_${category}_GEOMETRY`;
}
