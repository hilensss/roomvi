import { Injectable, Logger } from '@nestjs/common';
import {
  GenerationScenario,
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
} from '@roomvi/database';
import { CatalogReadService } from '../catalog/catalog-read.service.js';
import type {
  CuratedScenePlan,
  RoleCandidateGroup,
  SceneBlueprint,
  SceneRole,
  SceneRoleAssignment,
  SceneRoleAvailability,
} from './product-curation.types.js';
import {
  classifyProductSceneRoles,
  classifyProductSemantics,
} from './product-semantic-classifier.js';

export type BuildProductSetParams = {
  scenario?: GenerationScenario;
  roomType: RoomType;
  style: InteriorStyle;
  budgetMin?: number;
  budgetMax?: number;
  widthCm?: number;
  depthCm?: number;
  areaM2?: number;
  variantNumber: number;
  excludeProductIds?: string[];
  logSummary?: boolean;
  supplierId?: string;
  candidateLimit?: number;
  density?: 'sparse' | 'balanced' | 'layered';
};

export type ProductSetResult = {
  products: Product[];
  totalPrice: number;
  missingRequiredCategories: ProductCategory[];
};

export type CandidatePoolResult = {
  products: Product[];
  totalEligible: number;
  categoryCount: number;
};

export type ProductSelectionValidationResult = {
  productSet: ProductSetResult | null;
  invalidIds: number;
  repairOperations: string[];
};

export type RoleSelectionValidationResult = {
  productSet: ProductSetResult | null;
  roleAssignments: SceneRoleAssignment[];
  placementHints: CuratedScenePlan['placementHints'];
  repairOperations: string[];
};

type RoomProductTemplate = {
  required: ProductCategory[];
  recommended: ProductCategory[];
  optional: ProductCategory[];
  minProducts: number;
  maxProducts: number;
  minCoreProducts?: number;
  maxOptionalProducts?: number;
  categoryCaps?: Partial<Record<ProductCategory, number>>;
};

type PickProductParams = {
  category: ProductCategory;
  candidates: Product[];
  selected: Product[];
  params: BuildProductSetParams;
  maxBudget: number;
  strictBudget: boolean;
  categoryCap?: number;
  requireDimensions?: boolean;
  fallbackCandidates?: Product[];
};

const BEDROOM_ARMCHAIR_MIN_AREA_M2 = 16;
const LIVING_ROOM_ARMCHAIR_MIN_AREA_M2 = 18;
const STUDIO_ARMCHAIR_MIN_AREA_M2 = 24;

const HALLWAY_FUNCTIONAL_ANCHORS = new Set<ProductCategory>([
  ProductCategory.SHOE_CABINET,
  ProductCategory.HANGER,
  ProductCategory.WARDROBE,
  ProductCategory.DRESSER,
  ProductCategory.BENCH,
]);

const HALLWAY_SPECIALIZED_ANCHORS = new Set<ProductCategory>([
  ProductCategory.SHOE_CABINET,
  ProductCategory.HANGER,
  ProductCategory.BENCH,
]);

const HALLWAY_FALLBACK_STORAGE = new Set<ProductCategory>([
  ProductCategory.WARDROBE,
  ProductCategory.DRESSER,
]);

const ROOM_PRODUCT_TEMPLATES: Partial<Record<RoomType, RoomProductTemplate>> = {
  LIVING_ROOM: {
    required: [ProductCategory.SOFA],
    recommended: [
      ProductCategory.COFFEE_TABLE,
      ProductCategory.TV_STAND,
      ProductCategory.RUG,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
    ],
    optional: [
      ProductCategory.ARMCHAIR,
      ProductCategory.DRESSER,
      ProductCategory.DECOR,
    ],
    minProducts: 5,
    maxProducts: 7,
    minCoreProducts: 5,
    maxOptionalProducts: 1,
    categoryCaps: { [ProductCategory.ARMCHAIR]: 1 },
  },
  STUDIO: {
    required: [ProductCategory.SOFA],
    recommended: [
      ProductCategory.COFFEE_TABLE,
      ProductCategory.TV_STAND,
      ProductCategory.RUG,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
      ProductCategory.DESK,
    ],
    optional: [ProductCategory.ARMCHAIR, ProductCategory.DECOR],
    minProducts: 5,
    maxProducts: 8,
    minCoreProducts: 5,
    maxOptionalProducts: 1,
    categoryCaps: { [ProductCategory.ARMCHAIR]: 1 },
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
    optional: [ProductCategory.ARMCHAIR],
    minProducts: 4,
    maxProducts: 7,
    minCoreProducts: 4,
    maxOptionalProducts: 1,
    categoryCaps: { [ProductCategory.ARMCHAIR]: 1 },
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
    minProducts: 3,
    maxProducts: 6,
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
    minProducts: 4,
    maxProducts: 7,
  },
  HALLWAY: {
    required: [],
    recommended: [
      ProductCategory.SHOE_CABINET,
      ProductCategory.HANGER,
      ProductCategory.MIRROR,
      ProductCategory.BENCH,
      ProductCategory.WARDROBE,
      ProductCategory.DRESSER,
      ProductCategory.SHELF,
      ProductCategory.LAMP,
    ],
    optional: [ProductCategory.DECOR],
    minProducts: 1,
    maxProducts: 5,
    minCoreProducts: 1,
    maxOptionalProducts: 1,
    categoryCaps: {
      [ProductCategory.SHOE_CABINET]: 1,
      [ProductCategory.HANGER]: 1,
      [ProductCategory.MIRROR]: 1,
      [ProductCategory.BENCH]: 1,
      [ProductCategory.WARDROBE]: 1,
      [ProductCategory.DRESSER]: 1,
      [ProductCategory.SHELF]: 1,
      [ProductCategory.LAMP]: 1,
      [ProductCategory.DECOR]: 1,
    },
  },
  BATHROOM: {
    required: [ProductCategory.MIRROR],
    recommended: [ProductCategory.LAMP],
    optional: [ProductCategory.DECOR, ProductCategory.DECOR],
    minProducts: 1,
    maxProducts: 4,
    minCoreProducts: 1,
    maxOptionalProducts: 2,
    categoryCaps: {
      [ProductCategory.MIRROR]: 1,
      [ProductCategory.LAMP]: 1,
      [ProductCategory.DECOR]: 2,
    },
  },
};

const FALLBACK_TEMPLATE: RoomProductTemplate = {
  required: [],
  recommended: [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.RUG,
    ProductCategory.LAMP,
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

  async buildSceneRoleAvailability(
    params: BuildProductSetParams,
  ): Promise<SceneRoleAvailability> {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const candidates = await this.findCandidatePool(params, template);
    const availability: SceneRoleAvailability = {};

    for (const product of candidates) {
      for (const role of classifyProductSceneRoles(product)) {
        if (!this.isSuitableForSceneRole(product, role, params)) continue;
        availability[role] = (availability[role] ?? 0) + 1;
      }
    }

    return availability;
  }

  async buildRoleCandidateGroups(
    params: BuildProductSetParams,
    blueprint: SceneBlueprint,
  ): Promise<RoleCandidateGroup[]> {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const candidates = await this.findCandidatePool(params, template);
    const roles = Array.from(
      new Set([...blueprint.requiredRoles, ...blueprint.optionalRoles]),
    );

    return roles.map((role) => {
      const roleProducts = candidates
        .filter((product) => classifyProductSceneRoles(product).includes(role))
        .sort(
          (left, right) =>
            this.scoreRoleFit(right, role, params) -
              this.scoreRoleFit(left, role, params) ||
            this.scoreProduct(right, params) - this.scoreProduct(left, params) ||
            left.price - right.price,
        );
      const suitableProducts = roleProducts.filter((product) =>
        this.isSuitableForSceneRole(product, role, params),
      );
      const products =
        suitableProducts.length > 0
          ? suitableProducts
          : blueprint.requiredRoles.includes(role)
            ? roleProducts
            : [];

      return { role, products: products.slice(0, 5) };
    });
  }

  buildDeterministicRoleSelection(
    params: BuildProductSetParams,
    blueprint: SceneBlueprint,
    groups: RoleCandidateGroup[],
  ): RoleSelectionValidationResult {
    const roleAssignments: SceneRoleAssignment[] = [];
    const selectedProductIds: string[] = [];
    const maxProducts = this.getRoleProductCap(params, blueprint);
    const roles = [...blueprint.requiredRoles, ...blueprint.optionalRoles];

    for (const role of roles) {
      if (selectedProductIds.length >= maxProducts) break;
      const candidate = this.pickRoleCandidate(
        params,
        role,
        groups,
        selectedProductIds,
      );
      if (!candidate) continue;
      selectedProductIds.push(candidate.id);
      roleAssignments.push({ role, productId: candidate.id });
    }

    return this.validateAndRepairRoleSelection(
      params,
      blueprint,
      groups,
      {
        roomKey: blueprint.roomKey,
        variantIndex: blueprint.variantIndex,
        selectedProductIds,
        roleAssignments,
        placementHints: [],
      },
    );
  }

  validateAndRepairRoleSelection(
    params: BuildProductSetParams,
    blueprint: SceneBlueprint,
    groups: RoleCandidateGroup[],
    scenePlan: CuratedScenePlan,
  ): RoleSelectionValidationResult {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const candidateById = new Map(
      groups.flatMap(({ products }) => products).map((product) => [product.id, product]),
    );
    const rolesByProductId = new Map<string, Set<SceneRole>>();
    for (const { role, products } of groups) {
      for (const product of products) {
        const roles = rolesByProductId.get(product.id) ?? new Set<SceneRole>();
        roles.add(role);
        rolesByProductId.set(product.id, roles);
      }
    }
    const assignmentByProductId = new Map(
      scenePlan.roleAssignments.map((assignment) => [
        assignment.productId,
        assignment,
      ]),
    );
    const selected: Product[] = [];
    const assignments: SceneRoleAssignment[] = [];
    const seen = new Set<string>();
    const repairOperations: string[] = [];
    const maxBudget = params.budgetMax ?? Number.MAX_SAFE_INTEGER;
    const maxProducts = this.getRoleProductCap(params, blueprint);

    for (const productId of scenePlan.selectedProductIds) {
      const product = candidateById.get(productId);
      if (!product) {
        repairOperations.push('removed_unknown_product');
        continue;
      }
      if (seen.has(productId)) {
        repairOperations.push('removed_duplicate_product');
        continue;
      }
      if (selected.length >= maxProducts) {
        repairOperations.push('trimmed_density_cap');
        continue;
      }
      if (!this.fitsRoom(product, params)) {
        repairOperations.push('removed_oversized_product');
        continue;
      }
      if (!this.canSelectCategory(product.category, selected, template)) {
        repairOperations.push('trimmed_category_cap');
        continue;
      }
      if (
        selected.reduce((sum, item) => sum + item.price, 0) + product.price >
        maxBudget
      ) {
        repairOperations.push('trimmed_budget');
        continue;
      }
      const assignment = assignmentByProductId.get(productId);
      if (
        !assignment ||
        !rolesByProductId.get(productId)?.has(assignment.role) ||
        ![...blueprint.requiredRoles, ...blueprint.optionalRoles].includes(
          assignment.role,
        )
      ) {
        repairOperations.push('removed_role_mismatch');
        continue;
      }
      seen.add(productId);
      selected.push(product);
      assignments.push(assignment);
    }

    for (const role of blueprint.requiredRoles) {
      if (assignments.some((assignment) => assignment.role === role)) continue;
      const product = this.pickRoleCandidate(
        params,
        role,
        groups,
        selected.map(({ id }) => id),
        maxBudget - selected.reduce((sum, item) => sum + item.price, 0),
      );
      if (!product || selected.length >= maxProducts) continue;
      selected.push(product);
      assignments.push({ role, productId: product.id });
      repairOperations.push(`added_required_role_${role}`);
    }

    // AI may intentionally return a concise plan, but B2B bedrooms/living
    // rooms should not collapse to a single catalog item when the blueprint
    // already contains executable supporting roles. Fill only from those
    // approved roles; never invent categories and never pad kitchen/bathroom
    // exceptions with unrelated products.
    const minimumRoleProducts = this.getB2bMinimumRoleProductCount(
      params,
      blueprint,
      maxProducts,
    );
    for (const role of blueprint.optionalRoles) {
      if (selected.length >= minimumRoleProducts || selected.length >= maxProducts) {
        break;
      }
      if (assignments.some((assignment) => assignment.role === role)) continue;
      const product = this.pickRoleCandidate(
        params,
        role,
        groups,
        selected.map(({ id }) => id),
        maxBudget - selected.reduce((sum, item) => sum + item.price, 0),
      );
      if (!product) continue;
      if (!this.canSelectCategory(product.category, selected, template)) continue;
      selected.push(product);
      assignments.push({ role, productId: product.id });
      repairOperations.push(`added_b2b_support_role_${role}`);
    }

    const hasRequiredRoles = blueprint.requiredRoles.every((role) =>
      assignments.some((assignment) => assignment.role === role),
    );
    const allowsEmptyCommercialSet =
      params.scenario === GenerationScenario.B2B_DEVELOPER_ROOM &&
      blueprint.requiredRoles.length === 0 &&
      (blueprint.nonCommercialContext?.length ?? 0) > 0;

    if (!hasRequiredRoles || (selected.length === 0 && !allowsEmptyCommercialSet)) {
      return {
        productSet: null,
        roleAssignments: assignments,
        placementHints: [],
        repairOperations,
      };
    }

    const selectedIds = new Set(selected.map(({ id }) => id));
    return {
      productSet: {
        products: selected,
        totalPrice: selected.reduce((sum, product) => sum + product.price, 0),
        missingRequiredCategories: [],
      },
      roleAssignments: assignments,
      placementHints: scenePlan.placementHints.filter(
        ({ productId }) => !productId || selectedIds.has(productId),
      ),
      repairOperations,
    };
  }

  async buildCandidatePool(
    params: BuildProductSetParams,
  ): Promise<CandidatePoolResult> {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const ranked = await this.findCandidatePool(params, template);
    const limit = Math.max(8, Math.min(params.candidateLimit ?? 24, 40));
    const categoryOrder = Array.from(
      new Set([
        ...template.required,
        ...template.recommended,
        ...template.optional,
      ]),
    );
    const perCategory = Math.max(
      3,
      Math.min(5, Math.ceil(limit / Math.max(1, categoryOrder.length))),
    );
    const selected = new Map<string, Product>();

    for (const category of categoryOrder) {
      for (const product of ranked
        .filter((candidate) => candidate.category === category)
        .slice(0, perCategory)) {
        if (selected.size >= limit) break;
        selected.set(product.id, product);
      }
    }

    for (const product of ranked) {
      if (selected.size >= limit) break;
      selected.set(product.id, product);
    }

    return {
      products: Array.from(selected.values()),
      totalEligible: ranked.length,
      categoryCount: new Set(
        Array.from(selected.values()).map(({ category }) => category),
      ).size,
    };
  }

  validateAndRepairSelection(
    params: BuildProductSetParams,
    candidatePool: Product[],
    selectedProductIds: string[],
  ): ProductSelectionValidationResult {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const maxBudget = params.budgetMax ?? Number.MAX_SAFE_INTEGER;
    const maxProducts = this.getMaxProducts(params, template);
    const minProducts = Math.min(template.minProducts, maxProducts);
    const candidateById = new Map(candidatePool.map((product) => [product.id, product]));
    const finalCandidates = candidatePool;
    const selected: Product[] = [];
    const seen = new Set<string>();
    const repairOperations: string[] = [];
    let invalidIds = 0;

    for (const productId of selectedProductIds) {
      const product = candidateById.get(productId);
      if (!product) {
        invalidIds += 1;
        continue;
      }
      if (seen.has(productId)) {
        repairOperations.push('removed_duplicate');
        continue;
      }
      seen.add(productId);
      if (selected.length >= maxProducts) {
        repairOperations.push('trimmed_max_products');
        continue;
      }
      if (!this.isAllowedCategory(product.category, template)) {
        repairOperations.push('removed_disallowed_category');
        continue;
      }
      if (!this.fitsRoom(product, params)) {
        repairOperations.push('removed_oversized_product');
        continue;
      }
      if (!this.canSelectCategory(product.category, selected, template)) {
        repairOperations.push('trimmed_category_cap');
        continue;
      }
      if (
        selected.reduce((sum, item) => sum + item.price, 0) + product.price >
        maxBudget
      ) {
        repairOperations.push('trimmed_budget');
        continue;
      }
      selected.push(product);
    }

    const coreProducts = selected.filter(
      (product) => !template.optional.includes(product.category),
    );
    const eligibleOptional = selected.filter(
      (product) =>
        !template.optional.includes(product.category) ||
        this.isOptionalCategoryEligible(
          product.category,
          params,
          coreProducts,
          template,
        ),
    );
    if (eligibleOptional.length !== selected.length) {
      repairOperations.push('removed_ineligible_optional');
      selected.splice(0, selected.length, ...eligibleOptional);
    }

    for (const category of template.required) {
      if (selected.some((product) => product.category === category)) continue;

      this.makeRoomForRequiredProduct(selected, template, maxProducts);
      const product = this.pickBestProductForCategory({
        category,
        candidates: finalCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
        categoryCap: this.getCategoryCap(template, category),
        requireDimensions: true,
        fallbackCandidates: finalCandidates,
      });
      if (product) {
        selected.unshift(product);
        repairOperations.push(`added_required_${category}`);
      }
    }

    if (
      params.roomType === RoomType.HALLWAY &&
      !this.hasFunctionalAnchor(selected)
    ) {
      this.makeRoomForRequiredProduct(selected, template, maxProducts);
      const anchor = finalCandidates.find(
        (product) =>
          HALLWAY_FUNCTIONAL_ANCHORS.has(product.category) &&
          this.fitsRoom(product, params) &&
          selected.reduce((sum, item) => sum + item.price, 0) + product.price <=
            maxBudget,
      );
      if (anchor) {
        selected.unshift(anchor);
        repairOperations.push('added_hallway_anchor');
      }
    }

    this.fillProductSet({
      candidates: finalCandidates,
      selected,
      params,
      template,
      maxBudget,
      strictBudget: true,
      minProducts,
      maxProducts,
      fallbackCandidates: finalCandidates,
    });

    const missingRequiredCategories = template.required.filter(
      (category) => !selected.some((product) => product.category === category),
    );
    const fundamentallyInvalid =
      selected.length === 0 ||
      missingRequiredCategories.length > 0 ||
      (params.roomType === RoomType.HALLWAY &&
        !this.hasFunctionalAnchor(selected));

    if (fundamentallyInvalid) {
      return {
        productSet: null,
        invalidIds,
        repairOperations,
      };
    }

    return {
      productSet: {
        products: selected,
        totalPrice: selected.reduce((sum, product) => sum + product.price, 0),
        missingRequiredCategories,
      },
      invalidIds,
      repairOperations,
    };
  }

  async buildProductSetForVariant(
    params: BuildProductSetParams,
  ): Promise<ProductSetResult> {
    const startedAt = Date.now();
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const candidates = await this.findCandidatePool(params, template);
    const finalCandidates = candidates;
    const excludeProductIds = new Set(params.excludeProductIds ?? []);

    const availableCandidates = this.filterAllowedCategories(
      finalCandidates.filter((product) => !excludeProductIds.has(product.id)),
      template,
    );
    const fallbackCandidates = this.filterAllowedCategories(
      finalCandidates,
      template,
    );

    const selected: Product[] = [];
    const missingRequiredCategories: ProductCategory[] = [];
    const maxBudget = params.budgetMax ?? Number.MAX_SAFE_INTEGER;
    const maxProducts = this.getMaxProducts(params, template);
    const minProducts = Math.min(template.minProducts, maxProducts);
    const preferredProductCount = this.getPreferredProductCount(
      params,
      template,
      maxProducts,
    );

    for (const category of template.required) {
      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
        categoryCap: this.getCategoryCap(template, category),
        requireDimensions: true,
        fallbackCandidates,
      });

      if (!product) {
        missingRequiredCategories.push(category);
        continue;
      }

      selected.push(product);
    }

    for (const category of template.recommended) {
      if (selected.length >= preferredProductCount) break;
      if (
        !this.isRecommendedCategoryEligible(
          category,
          params,
          selected,
          fallbackCandidates,
        )
      ) {
        continue;
      }

      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
        categoryCap: this.getCategoryCap(template, category),
        fallbackCandidates,
      });

      if (product) selected.push(product);
    }

    let optionalProducts = 0;
    for (const category of template.optional) {
      if (selected.length >= preferredProductCount) break;
      if (
        optionalProducts >=
        (template.maxOptionalProducts ?? template.optional.length)
      ) {
        break;
      }
      if (
        !this.isOptionalCategoryEligible(
          category,
          params,
          selected,
          template,
        )
      ) {
        continue;
      }

      const product = this.pickBestProductForCategory({
        category,
        candidates: availableCandidates,
        selected,
        params,
        maxBudget,
        strictBudget: true,
        categoryCap: this.getCategoryCap(template, category),
      });

      if (product) {
        selected.push(product);
        optionalProducts += 1;
      }
    }

    this.fillProductSet({
      candidates: availableCandidates,
      selected,
      params,
      template,
      maxBudget,
      strictBudget: true,
      minProducts,
      maxProducts,
      fallbackCandidates,
    });

    const totalPrice = selected.reduce(
      (sum, product) => sum + product.price,
      0,
    );

    if (params.logSummary !== false) {
      this.logger.log(
        `Product set built: roomType=${params.roomType}, style=${params.style}, variant=${params.variantNumber}, products=${selected.length}, totalPrice=${totalPrice}, missingRequired=${missingRequiredCategories.join(',') || 'none'}, candidatePool=${candidates.length}, matchingMs=${Date.now() - startedAt}`,
      );
    }

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
        supplierId: params.supplierId,
        limit: 120,
      });

      for (const product of products) {
        if (
          this.isAllowedCategory(product.category, template) &&
          this.fitsRoom(product, params)
        ) {
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

  private makeRoomForRequiredProduct(
    selected: Product[],
    template: RoomProductTemplate,
    maxProducts: number,
  ) {
    if (selected.length < maxProducts) return;

    let removableIndex = -1;
    for (let index = selected.length - 1; index >= 0; index -= 1) {
      if (!template.required.includes(selected[index].category)) {
        removableIndex = index;
        if (template.optional.includes(selected[index].category)) break;
      }
    }
    if (removableIndex >= 0) selected.splice(removableIndex, 1);
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
    categoryCap,
    requireDimensions,
    fallbackCandidates,
  }: PickProductParams) {
    const selectedIds = new Set(selected.map((product) => product.id));
    const currentTotal = selected.reduce(
      (sum, product) => sum + product.price,
      0,
    );

    if (
      selected.filter((product) => product.category === category).length >=
      (categoryCap ?? Number.MAX_SAFE_INTEGER)
    ) {
      return undefined;
    }

    const getCategoryCandidates = (pool: Product[]) =>
      pool
        .filter((product) => product.category === category)
        .filter((product) => !selectedIds.has(product.id))
        .filter((product) =>
          requireDimensions
            ? Boolean(product.widthCm && product.depthCm)
            : true,
        )
        .filter((product) =>
          strictBudget ? currentTotal + product.price <= maxBudget : true,
        )
        .sort((a, b) => {
          const scoreDiff =
            this.scoreProduct(b, params) - this.scoreProduct(a, params);

          if (scoreDiff !== 0) return scoreDiff;

          return a.price - b.price;
        });

    const preferred = getCategoryCandidates(candidates);
    const categoryCandidates =
      preferred.length > 0
        ? preferred
        : getCategoryCandidates(fallbackCandidates ?? []);

    return categoryCandidates[0];
  }

  private fillProductSet({
    candidates,
    selected,
    params,
    template,
    maxBudget,
    strictBudget,
    minProducts,
    maxProducts,
    fallbackCandidates,
  }: {
    candidates: Product[];
    selected: Product[];
    params: BuildProductSetParams;
    template: RoomProductTemplate;
    maxBudget: number;
    strictBudget: boolean;
    minProducts: number;
    maxProducts: number;
    fallbackCandidates: Product[];
  }) {
    const selectedIds = new Set(selected.map((product) => product.id));
    const preferredCategories = [
      ...template.recommended,
      ...template.required,
    ];

    for (const category of preferredCategories) {
      if (selected.length >= minProducts || selected.length >= maxProducts)
        break;

      const product = this.pickBestProductForCategory({
        category,
        candidates,
        selected,
        params,
        maxBudget,
        strictBudget,
        categoryCap: this.getCategoryCap(template, category),
        fallbackCandidates,
      });

      if (!product || selectedIds.has(product.id)) continue;

      selected.push(product);
      selectedIds.add(product.id);
    }

    if (selected.length >= minProducts || selected.length >= maxProducts)
      return;

    const currentTotal = () =>
      selected.reduce((sum, product) => sum + product.price, 0);

    for (const product of [...fallbackCandidates].sort(
      (a, b) => this.scoreProduct(b, params) - this.scoreProduct(a, params),
    )) {
      if (selected.length >= minProducts || selected.length >= maxProducts)
        break;
      if (selectedIds.has(product.id)) continue;
      if (!this.isAllowedCategory(product.category, template)) continue;
      if (template.optional.includes(product.category)) continue;
      if (
        !this.isRecommendedCategoryEligible(
          product.category,
          params,
          selected,
          fallbackCandidates,
        )
      ) {
        continue;
      }
      if (!this.canSelectCategory(product.category, selected, template))
        continue;
      if (strictBudget && currentTotal() + product.price > maxBudget) continue;

      selected.push(product);
      selectedIds.add(product.id);
    }
  }

  private getMaxProducts(
    params: BuildProductSetParams,
    template: RoomProductTemplate,
  ) {
    const areaM2 = this.getRoomAreaM2(params);

    if (
      params.scenario === GenerationScenario.MARKETPLACE &&
      params.roomType === RoomType.BEDROOM &&
      params.density &&
      areaM2 !== null &&
      areaM2 < 10
    ) {
      return Math.min(template.maxProducts, 5);
    }

    if (params.roomType === RoomType.HALLWAY && areaM2 !== null && areaM2 < 4) {
      return Math.min(template.maxProducts, 2);
    }

    return template.maxProducts;
  }

  private getPreferredProductCount(
    params: BuildProductSetParams,
    template: RoomProductTemplate,
    maxProducts: number,
  ) {
    if (
      params.scenario === GenerationScenario.MARKETPLACE &&
      params.roomType === RoomType.BEDROOM
    ) {
      return Math.min(maxProducts, Math.max(template.minProducts, 5));
    }

    return maxProducts;
  }

  private getRoomAreaM2(params: BuildProductSetParams) {
    if (params.areaM2 && params.areaM2 > 0) return params.areaM2;

    return params.widthCm && params.depthCm
      ? (params.widthCm * params.depthCm) / 10_000
      : null;
  }

  private getB2bMinimumRoleProductCount(
    params: BuildProductSetParams,
    blueprint: SceneBlueprint,
    maxProducts: number,
  ) {
    if (params.scenario !== GenerationScenario.B2B_DEVELOPER_ROOM) return 0;

    const availableRoleCount = new Set([
      ...blueprint.requiredRoles,
      ...blueprint.optionalRoles,
    ]).size;

    let target = 0;
    switch (params.roomType) {
      case RoomType.BEDROOM: {
        const areaM2 = this.getRoomAreaM2(params);
        target = areaM2 !== null && areaM2 < 9 ? 3 : 4;
        break;
      }
      case RoomType.LIVING_ROOM:
        target = 4;
        break;
      case RoomType.HALLWAY: {
        const areaM2 = this.getRoomAreaM2(params);
        target = areaM2 !== null && areaM2 < 4 ? 1 : 2;
        break;
      }
      default:
        return 0;
    }

    return Math.min(target, availableRoleCount, maxProducts);
  }

  private getRoleProductCap(
    params: BuildProductSetParams,
    blueprint: SceneBlueprint,
  ) {
    const template =
      ROOM_PRODUCT_TEMPLATES[params.roomType] ?? FALLBACK_TEMPLATE;
    const densityCap =
      blueprint.density === 'AIRY'
        ? 5
        : blueprint.density === 'BALANCED'
          ? 7
          : 10;
    return Math.min(densityCap, this.getMaxProducts(params, template));
  }

  private pickRoleCandidate(
    params: BuildProductSetParams,
    role: SceneRole,
    groups: RoleCandidateGroup[],
    selectedProductIds: string[],
    remainingBudget = params.budgetMax ?? Number.MAX_SAFE_INTEGER,
  ) {
    const selected = new Set(selectedProductIds);
    return groups
      .find((group) => group.role === role)
      ?.products.filter((product) => !selected.has(product.id))
      .filter((product) => product.price <= remainingBudget)
      .filter((product) => this.fitsRoom(product, params))
      .sort((left, right) => {
        const roleDifference =
          this.scoreRoleFit(right, role, params) -
          this.scoreRoleFit(left, role, params);
        if (roleDifference !== 0) return roleDifference;
        const scoreDifference =
          this.scoreProduct(right, params) - this.scoreProduct(left, params);
        return scoreDifference || left.price - right.price;
      })[0];
  }

  private isSuitableForSceneRole(
    product: Product,
    role: SceneRole,
    params: BuildProductSetParams,
  ) {
    if (role === 'BEDSIDE') {
      if (product.category !== ProductCategory.DRESSER) return false;
      if (!product.widthCm) return true;
      const roomWidth = Math.min(
        params.widthCm ?? Number.MAX_SAFE_INTEGER,
        params.depthCm ?? Number.MAX_SAFE_INTEGER,
      );
      const maxWidth = Number.isFinite(roomWidth)
        ? Math.min(100, roomWidth * 0.3)
        : 100;
      return product.widthCm <= maxWidth;
    }


    if (
      role === 'SURFACE' &&
      params.roomType === RoomType.BEDROOM &&
      params.scenario === GenerationScenario.B2B_DEVELOPER_ROOM
    ) {
      return product.category === ProductCategory.DESK;
    }

    if (role === 'TEXTILE' && product.category === ProductCategory.RUG) {
      const roomArea = this.getRoomAreaM2(params);
      if (!product.widthCm || !product.depthCm || !roomArea) return true;
      const rugArea = (product.widthCm * product.depthCm) / 10_000;
      const minimumRatio = params.roomType === RoomType.BEDROOM ? 0.08 : 0.06;
      return rugArea / roomArea >= minimumRatio;
    }

    if (
      role === 'PRIMARY_ANCHOR' &&
      params.roomType === RoomType.BEDROOM &&
      product.category === ProductCategory.BED
    ) {
      const roomArea = this.getRoomAreaM2(params);
      if (!product.widthCm || !roomArea || roomArea < 11) return true;
      return product.widthCm >= 120;
    }

    return true;
  }

  private scoreRoleFit(
    product: Product,
    role: SceneRole,
    params: BuildProductSetParams,
  ) {
    let score = 0;

    if (
      role === 'PRIMARY_ANCHOR' &&
      params.roomType === RoomType.BEDROOM &&
      product.category === ProductCategory.BED &&
      product.widthCm
    ) {
      if (product.widthCm >= 140 && product.widthCm <= 180) score += 45;
      else if (product.widthCm >= 120 && product.widthCm <= 200) score += 20;
      else if (product.widthCm <= 100) score -= 45;
      else score -= 10;
    }

    if (role === 'BEDSIDE' && product.category === ProductCategory.DRESSER) {
      if (!product.widthCm) return score;
      if (product.widthCm <= 70) score += 45;
      else if (product.widthCm <= 90) score += 30;
      else if (product.widthCm <= 110) score += 5;
      else if (product.widthCm >= 140) score -= 70;
      else score -= 25;
      if (product.depthCm && product.depthCm <= 50) score += 8;
    }


    if (
      role === 'SURFACE' &&
      params.roomType === RoomType.BEDROOM &&
      params.scenario === GenerationScenario.B2B_DEVELOPER_ROOM
    ) {
      if (product.category === ProductCategory.DESK) score += 55;
      else score -= 80;
    }

    if (role === 'TEXTILE' && product.category === ProductCategory.RUG) {
      const roomArea = this.getRoomAreaM2(params);
      if (roomArea && product.widthCm && product.depthCm) {
        const ratio = (product.widthCm * product.depthCm) / 10_000 / roomArea;
        if (ratio >= 0.14 && ratio <= 0.35) score += 40;
        else if (ratio >= 0.08) score += 15;
        else score -= 50;
      }
    }

    if (role === 'TASK_LIGHTING') {
      const semantics = classifyProductSemantics(product);
      if (['TABLETOP', 'WALL', 'FLOOR'].includes(semantics.placement)) {
        score += 30;
      }
      if (semantics.placement === 'CEILING') score -= 60;
    }

    if (role === 'AMBIENT_LIGHTING') {
      const semantics = classifyProductSemantics(product);
      if (semantics.placement === 'CEILING') score += 18;
      if (
        params.roomType === RoomType.BEDROOM &&
        semantics.subtype === 'PENDANT'
      ) {
        score -= 12;
      }
    }

    return score;
  }

  private isOptionalCategoryEligible(
    category: ProductCategory,
    params: BuildProductSetParams,
    selected: Product[],
    template: RoomProductTemplate,
  ) {
    const selectedCoreProducts = selected.filter(
      (product) =>
        template.required.includes(product.category) ||
        template.recommended.includes(product.category),
    ).length;

    if (selectedCoreProducts < (template.minCoreProducts ?? 0)) return false;

    if (category === ProductCategory.ARMCHAIR) {
      const areaM2 = this.getRoomAreaM2(params);

      if (params.roomType === RoomType.BEDROOM) {
        return areaM2 !== null && areaM2 >= BEDROOM_ARMCHAIR_MIN_AREA_M2;
      }

      if (params.roomType === RoomType.LIVING_ROOM) {
        return areaM2 === null || areaM2 >= LIVING_ROOM_ARMCHAIR_MIN_AREA_M2;
      }

      if (params.roomType === RoomType.STUDIO) {
        return areaM2 !== null && areaM2 >= STUDIO_ARMCHAIR_MIN_AREA_M2;
      }

      return false;
    }

    if (params.roomType === RoomType.HALLWAY) {
      return (
        category !== ProductCategory.DECOR ||
        this.hasFunctionalAnchor(selected)
      );
    }

    return true;
  }

  private isRecommendedCategoryEligible(
    category: ProductCategory,
    params: BuildProductSetParams,
    selected: Product[],
    candidates: Product[],
  ) {
    if (params.roomType !== RoomType.HALLWAY) return true;

    const hasSpecializedAnchor = candidates.some((product) =>
      HALLWAY_SPECIALIZED_ANCHORS.has(product.category),
    );

    if (!hasSpecializedAnchor && HALLWAY_FALLBACK_STORAGE.has(category)) {
      return !selected.some((product) =>
        HALLWAY_FALLBACK_STORAGE.has(product.category),
      );
    }

    if (
      category === ProductCategory.LAMP ||
      category === ProductCategory.SHELF
    ) {
      return this.hasFunctionalAnchor(selected);
    }

    return true;
  }

  private hasFunctionalAnchor(products: Product[]) {
    return products.some((product) =>
      HALLWAY_FUNCTIONAL_ANCHORS.has(product.category),
    );
  }

  private getCategoryCap(
    template: RoomProductTemplate,
    category: ProductCategory,
  ) {
    return template.categoryCaps?.[category];
  }

  private canSelectCategory(
    category: ProductCategory,
    selected: Product[],
    template: RoomProductTemplate,
  ) {
    const cap = this.getCategoryCap(template, category);
    if (cap === undefined) return true;
    return (
      selected.filter((product) => product.category === category).length < cap
    );
  }

  private fitsRoom(product: Product, params: BuildProductSetParams) {
    if (!params.widthCm || !params.depthCm) return true;
    if (!product.widthCm || !product.depthCm) return true;

    return (
      (product.widthCm <= params.widthCm &&
        product.depthCm <= params.depthCm) ||
      (product.widthCm <= params.depthCm &&
        product.depthCm <= params.widthCm)
    );
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
    score += this.getLightingPlacementScore(product, params.roomType);

    if (product.imageUrls.length > 0) score += 4;

    if (product.oldPrice && product.oldPrice > product.price) {
      score += 3;
    }

    return score;
  }

  private getLightingPlacementScore(product: Product, roomType: RoomType) {
    if (
      roomType !== RoomType.BEDROOM ||
      product.category !== ProductCategory.LAMP
    ) {
      return 0;
    }

    const { placement } = classifyProductSemantics(product);
    if (['TABLETOP', 'WALL', 'FLOOR'].includes(placement)) return 12;
    if (placement === 'CEILING') return -4;
    return 0;
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
