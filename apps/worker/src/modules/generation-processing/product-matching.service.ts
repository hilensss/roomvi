import { Injectable, Logger } from '@nestjs/common';
import {
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
} from '@roomvi/database';
import { CatalogReadService } from '../catalog/catalog-read.service.js';

type BuildProductSetParams = {
  roomType: RoomType;
  style: InteriorStyle;
  budgetMin?: number;
  budgetMax?: number;
  widthCm?: number;
  depthCm?: number;
  variantNumber: number;
  excludeProductIds?: string[];
};

export type ProductSetResult = {
  products: Product[];
  totalPrice: number;
  missingRequiredCategories: ProductCategory[];
};

type RoomProductTemplate = {
  required: ProductCategory[];
  recommended: ProductCategory[];
  optional: ProductCategory[];
  minProducts: number;
  maxProducts: number;
};

type PickProductParams = {
  category: ProductCategory;
  candidates: Product[];
  selected: Product[];
  params: BuildProductSetParams;
  maxBudget: number;
  strictBudget: boolean;
};

const ROOM_PRODUCT_TEMPLATES: Partial<Record<RoomType, RoomProductTemplate>> = {
  LIVING_ROOM: {
    required: [ProductCategory.SOFA],
    recommended: [
      ProductCategory.COFFEE_TABLE,
      ProductCategory.TV_STAND,
      ProductCategory.RUG,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
      ProductCategory.ARMCHAIR,
    ],
    optional: [
      ProductCategory.DRESSER,
      ProductCategory.LAMP,
      ProductCategory.DECOR,
      ProductCategory.DECOR,
    ],
    minProducts: 7,
    maxProducts: 9,
  },
  STUDIO: {
    required: [ProductCategory.SOFA],
    recommended: [
      ProductCategory.COFFEE_TABLE,
      ProductCategory.TV_STAND,
      ProductCategory.RUG,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
      ProductCategory.ARMCHAIR,
    ],
    optional: [
      ProductCategory.DESK,
      ProductCategory.LAMP,
      ProductCategory.DECOR,
      ProductCategory.DECOR,
    ],
    minProducts: 7,
    maxProducts: 9,
  },
  BEDROOM: {
    required: [ProductCategory.BED],
    recommended: [
      ProductCategory.WARDROBE,
      ProductCategory.DRESSER,
      ProductCategory.LAMP,
      ProductCategory.RUG,
      ProductCategory.DECOR,
    ],
    optional: [
      ProductCategory.ARMCHAIR,
      ProductCategory.SHELF,
      ProductCategory.DESK,
      ProductCategory.LAMP,
      ProductCategory.DECOR,
    ],
    minProducts: 6,
    maxProducts: 8,
  },
  KITCHEN: {
    required: [ProductCategory.TABLE],
    recommended: [
      ProductCategory.CHAIR,
      ProductCategory.CHAIR,
      ProductCategory.LAMP,
      ProductCategory.SHELF,
    ],
    optional: [ProductCategory.DECOR, ProductCategory.DECOR],
    minProducts: 5,
    maxProducts: 7,
  },
  OFFICE: {
    required: [ProductCategory.DESK],
    recommended: [
      ProductCategory.CHAIR,
      ProductCategory.LAMP,
      ProductCategory.SHELF,
      ProductCategory.RUG,
    ],
    optional: [ProductCategory.DECOR, ProductCategory.DECOR],
    minProducts: 5,
    maxProducts: 7,
  },
  KIDS_ROOM: {
    required: [ProductCategory.BED],
    recommended: [
      ProductCategory.DESK,
      ProductCategory.CHAIR,
      ProductCategory.WARDROBE,
      ProductCategory.LAMP,
      ProductCategory.RUG,
    ],
    optional: [
      ProductCategory.SHELF,
      ProductCategory.DECOR,
      ProductCategory.DECOR,
    ],
    minProducts: 6,
    maxProducts: 8,
  },
  HALLWAY: {
    required: [ProductCategory.WARDROBE],
    recommended: [
      ProductCategory.DRESSER,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
    ],
    optional: [ProductCategory.DECOR, ProductCategory.DECOR],
    minProducts: 4,
    maxProducts: 6,
  },
};

const FALLBACK_TEMPLATE: RoomProductTemplate = {
  required: [],
  recommended: [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.RUG,
    ProductCategory.LAMP,
    ProductCategory.ARMCHAIR,
  ],
  optional: [
    ProductCategory.SHELF,
    ProductCategory.DECOR,
    ProductCategory.DECOR,
  ],
  minProducts: 5,
  maxProducts: 7,
};

const STYLE_FALLBACKS: Partial<Record<InteriorStyle, InteriorStyle[]>> = {
  CLASSIC: [
    InteriorStyle.NEOCLASSIC,
    InteriorStyle.PROVENCE,
    InteriorStyle.MODERN,
  ],
  NEOCLASSIC: [
    InteriorStyle.CLASSIC,
    InteriorStyle.PROVENCE,
    InteriorStyle.MODERN,
  ],
  PROVENCE: [
    InteriorStyle.CLASSIC,
    InteriorStyle.NEOCLASSIC,
    InteriorStyle.SCANDI,
  ],
  SCANDI: [InteriorStyle.MINIMALISM, InteriorStyle.JAPANDI, InteriorStyle.ECO],
  MINIMALISM: [
    InteriorStyle.MODERN,
    InteriorStyle.SCANDI,
    InteriorStyle.JAPANDI,
  ],
  MODERN: [
    InteriorStyle.MINIMALISM,
    InteriorStyle.SCANDI,
    InteriorStyle.HIGH_TECH,
  ],
  JAPANDI: [InteriorStyle.SCANDI, InteriorStyle.MINIMALISM, InteriorStyle.ECO],
  ECO: [InteriorStyle.JAPANDI, InteriorStyle.SCANDI, InteriorStyle.MINIMALISM],
  LOFT: [
    InteriorStyle.MODERN,
    InteriorStyle.HIGH_TECH,
    InteriorStyle.MINIMALISM,
  ],
  HIGH_TECH: [
    InteriorStyle.MODERN,
    InteriorStyle.MINIMALISM,
    InteriorStyle.LOFT,
  ],
};

@Injectable()
export class ProductMatchingService {
  private readonly logger = new Logger(ProductMatchingService.name);

  constructor(private readonly catalogReadService: CatalogReadService) {}

  async buildProductSetForVariant(
    params: BuildProductSetParams,
  ): Promise<ProductSetResult> {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const candidates = await this.findCandidatePool(params, template);
    const excludeProductIds = new Set(params.excludeProductIds ?? []);

    let availableCandidates = this.filterAllowedCategories(
      candidates.filter((product) => !excludeProductIds.has(product.id)),
      template,
    );

    /**
     * If the catalog is still too small after excluding products from previous
     * variants, allow reuse. It is better to repeat a good bed/sofa than to
     * produce an empty or wrong-room design.
     */
    if (availableCandidates.length < template.minProducts) {
      availableCandidates = this.filterAllowedCategories(candidates, template);
    }

    const selected: Product[] = [];
    const missingRequiredCategories: ProductCategory[] = [];
    const maxBudget = params.budgetMax ?? Number.MAX_SAFE_INTEGER;

    for (const category of template.required) {
      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
      });

      if (!product) {
        missingRequiredCategories.push(category);
        continue;
      }

      selected.push(product);
    }

    for (const category of template.recommended) {
      if (selected.length >= template.maxProducts) break;

      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
      });

      if (product) selected.push(product);
    }

    for (const category of template.optional) {
      if (selected.length >= template.maxProducts) break;

      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
      });

      if (product) selected.push(product);
    }

    this.fillProductSet({
      candidates: availableCandidates,
      selected,
      params,
      template,
      maxBudget,
      strictBudget: true,
    });

    if (selected.length < template.minProducts) {
      this.fillProductSet({
        candidates: availableCandidates,
        selected,
        params,
        template,
        maxBudget,
        strictBudget: false,
      });
    }

    const totalPrice = selected.reduce(
      (sum, product) => sum + product.price,
      0,
    );

    this.logger.log(
      `Product set built: roomType=${params.roomType}, style=${params.style}, variant=${params.variantNumber}, products=${selected.length}, totalPrice=${totalPrice}, missingRequired=${missingRequiredCategories.join(',') || 'none'}, candidatePool=${candidates.length}`,
    );

    return {
      products: selected,
      totalPrice,
      missingRequiredCategories,
    };
  }

  private async findCandidatePool(
    params: BuildProductSetParams,
    template: RoomProductTemplate,
  ) {
    const productsById = new Map<string, Product>();
    const stylesToTry = this.getStylesToTry(params.style);

    for (const style of stylesToTry) {
      const products = await this.catalogReadService.findAiEligibleProducts({
        roomType: params.roomType,
        style,
        maxBudget: params.budgetMax,
        limit: 120,
      });

      for (const product of products) {
        if (this.isAllowedCategory(product.category, template)) {
          productsById.set(product.id, product);
        }
      }

      if (productsById.size >= template.maxProducts * 6) break;
    }

    return Array.from(productsById.values()).sort(
      (a, b) => this.scoreProduct(b, params) - this.scoreProduct(a, params),
    );
  }

  private getStylesToTry(style: InteriorStyle) {
    const styles = [style, ...(STYLE_FALLBACKS[style] ?? [])];

    /**
     * Modern/minimal products are often usable as neutral fillers for many
     * visual styles, especially while the catalog is still small.
     */
    if (!styles.includes(InteriorStyle.MODERN))
      styles.push(InteriorStyle.MODERN);
    if (!styles.includes(InteriorStyle.MINIMALISM)) {
      styles.push(InteriorStyle.MINIMALISM);
    }

    return Array.from(new Set(styles));
  }

  private filterAllowedCategories(
    products: Product[],
    template: RoomProductTemplate,
  ) {
    return products.filter((product) =>
      this.isAllowedCategory(product.category, template),
    );
  }

  private isAllowedCategory(
    category: ProductCategory,
    template: RoomProductTemplate,
  ) {
    return [
      ...template.required,
      ...template.recommended,
      ...template.optional,
    ].includes(category);
  }

  private pickBestProductForCategory({
    category,
    candidates,
    selected,
    params,
    maxBudget,
    strictBudget,
  }: PickProductParams) {
    const selectedIds = new Set(selected.map((product) => product.id));
    const currentTotal = selected.reduce(
      (sum, product) => sum + product.price,
      0,
    );

    const categoryCandidates = candidates
      .filter((product) => product.category === category)
      .filter((product) => !selectedIds.has(product.id))
      .filter((product) =>
        strictBudget ? currentTotal + product.price <= maxBudget : true,
      )
      .sort((a, b) => {
        const scoreDiff =
          this.scoreProduct(b, params) - this.scoreProduct(a, params);

        if (scoreDiff !== 0) return scoreDiff;

        return a.price - b.price;
      });

    return categoryCandidates[0];
  }

  private fillProductSet({
    candidates,
    selected,
    params,
    template,
    maxBudget,
    strictBudget,
  }: {
    candidates: Product[];
    selected: Product[];
    params: BuildProductSetParams;
    template: RoomProductTemplate;
    maxBudget: number;
    strictBudget: boolean;
  }) {
    const selectedIds = new Set(selected.map((product) => product.id));
    const preferredCategories = [
      ...template.recommended,
      ...template.optional,
      ...template.required,
    ];

    for (const category of preferredCategories) {
      if (selected.length >= template.minProducts) break;

      const product = this.pickBestProductForCategory({
        category,
        candidates,
        selected,
        params,
        maxBudget,
        strictBudget,
      });

      if (!product || selectedIds.has(product.id)) continue;

      selected.push(product);
      selectedIds.add(product.id);
    }

    if (selected.length >= template.minProducts) return;

    const currentTotal = () =>
      selected.reduce((sum, product) => sum + product.price, 0);

    for (const product of [...candidates].sort(
      (a, b) => this.scoreProduct(b, params) - this.scoreProduct(a, params),
    )) {
      if (selected.length >= template.minProducts) break;
      if (selectedIds.has(product.id)) continue;
      if (!this.isAllowedCategory(product.category, template)) continue;
      if (strictBudget && currentTotal() + product.price > maxBudget) continue;

      selected.push(product);
      selectedIds.add(product.id);
    }
  }

  private scoreProduct(product: Product, params: BuildProductSetParams) {
    let score = 0;

    if (product.roomTypes.includes(params.roomType)) score += 50;
    score += this.getStyleScore(product, params.style);
    score += this.getCategoryRoomScore(product.category, params.roomType);
    score += this.getBudgetFitScore(product, params);
    score += this.getSizeFitScore(product, params);
    score += this.getVariantDiversificationScore(product, params.variantNumber);
    score += this.getMaterialColorScore(product, params.style);

    if (product.imageUrls.length > 0) score += 4;

    if (product.oldPrice && product.oldPrice > product.price) {
      score += 3;
    }

    return score;
  }

  private getStyleScore(product: Product, style: InteriorStyle) {
    if (product.styleTags.includes(style)) return 45;

    const fallbackIndex = (STYLE_FALLBACKS[style] ?? []).findIndex((fallback) =>
      product.styleTags.includes(fallback),
    );

    if (fallbackIndex >= 0) return 24 - fallbackIndex * 4;

    if (
      product.styleTags.includes(InteriorStyle.MODERN) ||
      product.styleTags.includes(InteriorStyle.MINIMALISM)
    ) {
      return 8;
    }

    return -15;
  }

  private getCategoryRoomScore(category: ProductCategory, roomType: RoomType) {
    const template = ROOM_PRODUCT_TEMPLATES[roomType] ?? FALLBACK_TEMPLATE;

    if (template.required.includes(category)) return 40;
    if (template.recommended.includes(category)) return 26;
    if (template.optional.includes(category)) return 12;

    return -60;
  }

  private getBudgetFitScore(product: Product, params: BuildProductSetParams) {
    if (!params.budgetMax) return 0;

    const budgetShare = product.price / params.budgetMax;

    if (budgetShare <= 0.08) return 10;
    if (budgetShare <= 0.15) return 14;
    if (budgetShare <= 0.25) return 12;
    if (budgetShare <= 0.4) return 6;
    if (budgetShare <= 0.6) return 0;

    return -12;
  }

  private getSizeFitScore(product: Product, params: BuildProductSetParams) {
    if (!params.widthCm || !params.depthCm) return 0;
    if (!product.widthCm || !product.depthCm) return 0;

    const roomWidth = params.widthCm;
    const roomDepth = params.depthCm;

    const maxFurnitureWidth = roomWidth * 0.88;
    const maxFurnitureDepth = roomDepth * 0.75;

    if (
      product.widthCm <= maxFurnitureWidth &&
      product.depthCm <= maxFurnitureDepth
    ) {
      return 10;
    }

    if (product.widthCm <= roomWidth && product.depthCm <= roomDepth) {
      return 2;
    }

    return -30;
  }

  private getVariantDiversificationScore(
    product: Product,
    variantNumber: number,
  ) {
    if (variantNumber === 1) {
      return product.oldPrice ? 5 : 0;
    }

    if (variantNumber === 2) {
      return product.price <= 30_000 ? 4 : 1;
    }

    if (variantNumber === 3) {
      return product.price > 50_000 ? 6 : 0;
    }

    if (variantNumber >= 4) {
      return product.price > 20_000 && product.price < 80_000 ? 5 : 0;
    }

    return 0;
  }

  private getMaterialColorScore(product: Product, style: InteriorStyle) {
    const color = product.color?.toLowerCase() ?? '';
    const material = product.material?.toLowerCase() ?? '';
    const title = product.title.toLowerCase();

    if (style === InteriorStyle.CLASSIC || style === InteriorStyle.NEOCLASSIC) {
      if (
        color.includes('беж') ||
        color.includes('бел') ||
        color.includes('молоч') ||
        color.includes('сер') ||
        title.includes('classic') ||
        title.includes('provence') ||
        title.includes('nova')
      ) {
        return 8;
      }
    }

    if (style === InteriorStyle.PROVENCE) {
      if (
        color.includes('беж') ||
        color.includes('бел') ||
        color.includes('молоч') ||
        title.includes('provence') ||
        material.includes('ткань') ||
        material.includes('дерево')
      ) {
        return 8;
      }
    }

    if (style === InteriorStyle.SCANDI || style === InteriorStyle.MINIMALISM) {
      if (
        color.includes('беж') ||
        color.includes('бел') ||
        color.includes('сер') ||
        color.includes('дуб') ||
        color.includes('молоч')
      ) {
        return 7;
      }
    }

    if (style === InteriorStyle.LOFT || style === InteriorStyle.HIGH_TECH) {
      if (
        color.includes('чер') ||
        color.includes('графит') ||
        color.includes('антрацит') ||
        material.includes('металл')
      ) {
        return 7;
      }
    }

    if (style === InteriorStyle.ECO || style === InteriorStyle.JAPANDI) {
      if (
        color.includes('дуб') ||
        color.includes('беж') ||
        material.includes('дерево') ||
        material.includes('ткань')
      ) {
        return 7;
      }
    }

    return 0;
  }
}
