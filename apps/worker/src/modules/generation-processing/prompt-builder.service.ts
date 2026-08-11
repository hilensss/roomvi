import { Injectable } from '@nestjs/common';
import {
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
} from '@roomvi/database';
import type {
  ProductScenePlan,
  RoomSpatialProfile,
} from './product-curation.types.js';
import { classifyProductSemantics } from './product-semantic-classifier.js';
import { getProductRenderProfile } from './product-render-profile.js';
import { hasBuiltInNonCommercialCore } from './b2b-generation-policy.js';

export type PromptInput = {
  roomType: RoomType;
  style: InteriorStyle;
  title?: string;
  budgetMin?: number;
  budgetMax?: number;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  sourceImageUrl?: string;
  scenePlan?: ProductScenePlan;
  spatialProfile?: RoomSpatialProfile;
};

type PromptWithinLimitResult = {
  prompt: string;
  mode: 'full' | 'compact';
  includedProductsCount: number;
  totalProductsCount: number;
};

const PRODUCT_CATEGORY_LABELS: Record<ProductCategory, string> = {
  SOFA: 'sofa / couch for a living room seating area',
  ARMCHAIR: 'armchair / lounge chair',
  CHAIR: 'chair',
  COFFEE_TABLE: 'coffee table',
  TABLE: 'dining table / table',
  TV_STAND: 'TV stand / media console',
  BED: 'bed with mattress, pillows and headboard',
  MATTRESS: 'mattress for the selected bed',
  WARDROBE: 'wardrobe / large clothes storage cabinet',
  DRESSER: 'dresser / chest of drawers',
  SHELF: 'shelf / bookcase / storage rack',
  DESK: 'desk / working table',
  RUG: 'rug / carpet',
  LAMP: 'lamp / lighting fixture',
  DECOR: 'small decor item',
  MIRROR: 'wall or floor mirror',
  BENCH: 'hallway bench / banquette',
  SHOE_CABINET: 'compact shoe storage cabinet',
  HANGER: 'wall or floor clothes hanger',
  OTHER: 'other catalog item',
};

const COMPACT_DESCRIPTION_MAX_LENGTH = 120;
const YES_AI_SAFE_BASE_PROMPT_LENGTH = 8000;
const B2B_DEVELOPER_SAFE_BASE_PROMPT_LENGTH = 8200;

const ROOM_HERO_CATEGORY: Partial<Record<RoomType, ProductCategory>> = {
  LIVING_ROOM: ProductCategory.SOFA,
  BEDROOM: ProductCategory.BED,
  OFFICE: ProductCategory.DESK,
  KITCHEN: ProductCategory.TABLE,
  KIDS_ROOM: ProductCategory.BED,
  HALLWAY: ProductCategory.WARDROBE,
  STUDIO: ProductCategory.SOFA,
};


@Injectable()
export class PromptBuilderService {
  buildPrompt(dto: PromptInput, products: Product[]) {
    const productCategories = this.getProductCategories(products);
    const productLines = this.buildProductLines(products);
    const styleInstructions = this.buildStyleInstructions(dto.style);
    const roomInstructions = this.buildRoomInstructions(dto, productCategories);
    const catalogRules = this.buildCatalogRules(
      dto,
      products,
      productCategories,
    );
    const compositionRules = this.buildCompositionRules(
      dto.roomType,
      productCategories,
    );
    const missingCategoryRules = this.buildMissingCategoryRules(
      dto.roomType,
      productCategories,
    );
    const sceneGuidance = this.buildSceneGuidance(dto, products);

    return [
      'You are an expert interior designer and photorealistic interior renderer for an online furniture marketplace.',
      'Your task is to create a beautiful, realistic, commercially attractive room design based on the source room and the selected catalog products.',
      '',
      'ROOM BRIEF:',
      `Room type: ${dto.roomType}.`,
      `Interior style: ${dto.style}.`,
      dto.title ? `Project title: ${dto.title}.` : null,
      dto.budgetMax ? `Maximum furniture budget: ${dto.budgetMax} RUB.` : null,
      dto.widthCm && dto.depthCm
        ? `Room footprint: ${dto.widthCm} cm width x ${dto.depthCm} cm depth.`
        : null,
      dto.heightCm ? `Ceiling height: ${dto.heightCm} cm.` : null,
      dto.sourceImageUrl
        ? 'Use the source room image as a strict reference for layout, geometry, camera angle, windows, doors, walls, floor, ceiling and proportions.'
        : 'Create a realistic room layout with natural proportions and believable camera perspective.',
      ...(sceneGuidance.length
        ? ['', 'SCENE BLUEPRINT:', ...sceneGuidance]
        : []),
      '',
      'STYLE DIRECTION:',
      ...styleInstructions,
      '',
      'ROOM-SPECIFIC DESIGN RULES:',
      ...roomInstructions,
      '',
      'COMMERCIAL PRODUCTS:',
      productLines ||
        'No catalog products were provided. Keep the room minimal and do not invent major furniture.',
      ...(products.length
        ? ['', 'COMMERCIAL PRODUCT FIDELITY CONTRACT:', ...this.buildProductFidelityRules(products)]
        : []),
      '',
      'SCENE DRESSING:',
      ...this.buildSceneDressingRules(dto),
      '',
      'CATALOG PRODUCT CONTROL RULES:',
      ...catalogRules,
      '',
      'SCENE COMPOSITION:',
      ...compositionRules,
      '',
      'MISSING CATEGORY RESTRICTIONS:',
      ...missingCategoryRules,
      '',
      'FINAL QUALITY TARGET:',
      'The image must look like a premium editorial residential interior photograph: cohesive, styled and believable, not a collage, sparse catalog showroom or product grid.',
      'Use soft natural light, realistic shadows, correct scale, coherent materials, clean styling and tasteful spacing.',
      'Make the room feel finished, layered and genuinely residential even when the commercial set is small; complete the atmosphere with allowed scene dressing rather than invented major furniture.',
      'Do not place product labels, text annotations, arrows, prices, brand labels or measurement text in the image.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  buildPromptWithinLimit(
    dto: PromptInput,
    products: Product[],
    maxLength = 9500,
  ): PromptWithinLimitResult {
    const effectiveMaxLength = Math.min(
      maxLength,
      YES_AI_SAFE_BASE_PROMPT_LENGTH,
    );
    const fullPrompt = this.buildPrompt(dto, products);

    if (fullPrompt.length <= effectiveMaxLength) {
      return {
        prompt: fullPrompt,
        mode: 'full',
        includedProductsCount: products.length,
        totalProductsCount: products.length,
      };
    }

    const compactPrompt = this.buildCompactPrompt(dto, products, products);

    if (compactPrompt.length <= effectiveMaxLength) {
      return {
        prompt: compactPrompt,
        mode: 'compact',
        includedProductsCount: products.length,
        totalProductsCount: products.length,
      };
    }

    // Fidelity must not be "fixed" by silently removing selected products from
    // the textual contract. Product references are sent separately by the
    // provider, so when the rich prompt is too large we switch to a deliberately
    // small contract that still names every selected SKU.
    const ultraCompactPrompt = this.buildUltraCompactPrompt(dto, products);

    const finalPrompt =
      ultraCompactPrompt.length <= effectiveMaxLength
        ? ultraCompactPrompt
        : this.buildEssentialCatalogPrompt(dto, products);

    if (finalPrompt.length > effectiveMaxLength) {
      throw new Error(
        `YES AI essential catalog prompt exceeds safe ${effectiveMaxLength} character budget: ${finalPrompt.length}`,
      );
    }

    return {
      prompt: finalPrompt,
      mode: 'compact',
      includedProductsCount: products.length,
      totalProductsCount: products.length,
    };
  }

  buildDeveloperPromptWithinLimit(
    dto: PromptInput,
    products: Product[],
    maxLength = B2B_DEVELOPER_SAFE_BASE_PROMPT_LENGTH,
  ): PromptWithinLimitResult {
    const effectiveMaxLength = Math.min(
      maxLength,
      B2B_DEVELOPER_SAFE_BASE_PROMPT_LENGTH,
    );
    this.validateDeveloperProductContract(dto, products);

    const fullPrompt = this.buildDeveloperPrompt(dto, products, false);
    if (fullPrompt.length <= effectiveMaxLength) {
      return {
        prompt: fullPrompt,
        mode: 'full',
        includedProductsCount: products.length,
        totalProductsCount: products.length,
      };
    }

    const compactPrompt = this.buildDeveloperPrompt(dto, products, true);
    if (compactPrompt.length > effectiveMaxLength) {
      throw new Error(
        `B2B developer prompt exceeds safe ${effectiveMaxLength} character budget: ${compactPrompt.length}`,
      );
    }
    return {
      prompt: compactPrompt,
      mode: 'compact',
      includedProductsCount: products.length,
      totalProductsCount: products.length,
    };
  }

  buildNegativePrompt(dto?: PromptInput, products: Product[] = []) {
    const productCategories = this.getProductCategories(products);
    const nonCommercialContext = dto?.scenePlan?.nonCommercialContext ?? [];
    const hasBuiltInCore = hasBuiltInNonCommercialCore(nonCommercialContext);
    const hasExactDeveloperGeometry = Boolean(
      dto?.sourceImageUrl &&
        dto.scenePlan &&
        dto.spatialProfile?.exactDoorCount !== undefined &&
        dto.spatialProfile.exactWindowCount !== undefined,
    );

    return [
      'low quality',
      'bad quality',
      'blurry',
      'distorted furniture',
      'deformed furniture',
      'unrealistic geometry',
      'broken perspective',
      'wrong scale',
      'floating objects',
      'cluttered room',
      'messy room',
      'too many objects',
      hasBuiltInCore ? 'extra freestanding commercial furniture' : 'extra furniture',
      hasBuiltInCore ? 'unselected freestanding catalog furniture' : 'unlisted furniture',
      hasBuiltInCore ? null : 'furniture not in catalog',
      hasExactDeveloperGeometry ? null : 'extra doors',
      hasExactDeveloperGeometry ? null : 'missing doors',
      hasExactDeveloperGeometry ? null : 'moved doors',
      hasExactDeveloperGeometry ? null : 'extra windows',
      hasExactDeveloperGeometry ? null : 'missing windows',
      hasExactDeveloperGeometry ? null : 'moved windows',
      hasExactDeveloperGeometry ? null : 'broken windows',
      'dark unusable lighting',
      'overexposed',
      'underexposed',
      'watermark',
      'text',
      'labels',
      'captions',
      'price tags',
      'measurement text',
      'logo',
      ...this.buildRoomNegativePrompt(dto?.roomType),
      ...this.buildMissingCategoryNegativePrompt(
        productCategories,
        nonCommercialContext,
      ),
    ]
      .filter(Boolean)
      .join(', ');
  }

  private buildCompactPrompt(
    dto: PromptInput,
    allProducts: Product[],
    includedProducts: Product[],
  ) {
    const productCategories = this.getProductCategories(includedProducts);
    const productLines = this.buildCompactProductLines(
      includedProducts,
      allProducts,
    );
    const styleInstructions = this.buildStyleInstructions(dto.style);
    const roomInstructions = this.buildRoomInstructions(dto, productCategories);
    const catalogRules = this.buildCatalogRules(
      dto,
      allProducts,
      productCategories,
    );
    const compositionRules = this.buildCompositionRules(
      dto.roomType,
      productCategories,
    );
    const missingCategoryRules = this.buildMissingCategoryRules(
      dto.roomType,
      productCategories,
    );
    const sceneGuidance = this.buildSceneGuidance(dto, includedProducts);

    return [
      'You are an expert interior designer and photorealistic interior renderer for an online furniture marketplace.',
      'Your task is to create a beautiful, realistic, commercially attractive room design based on the source room and the selected catalog products.',
      '',
      'ROOM BRIEF:',
      `Room type: ${dto.roomType}.`,
      `Interior style: ${dto.style}.`,
      dto.title ? `Project title: ${dto.title}.` : null,
      dto.budgetMax ? `Maximum furniture budget: ${dto.budgetMax} RUB.` : null,
      dto.widthCm && dto.depthCm
        ? `Room footprint: ${dto.widthCm} cm width x ${dto.depthCm} cm depth.`
        : null,
      dto.heightCm ? `Ceiling height: ${dto.heightCm} cm.` : null,
      dto.sourceImageUrl
        ? 'Use the source room image as a strict reference for layout, geometry, camera angle, windows, doors, walls, floor, ceiling and proportions.'
        : 'Create a realistic room layout with natural proportions and believable camera perspective.',
      ...(sceneGuidance.length
        ? ['', 'SCENE BLUEPRINT:', ...sceneGuidance]
        : []),
      '',
      'STYLE DIRECTION:',
      ...styleInstructions,
      '',
      'ROOM-SPECIFIC DESIGN RULES:',
      ...roomInstructions,
      '',
      'COMMERCIAL PRODUCTS:',
      productLines ||
        'No catalog products were provided. Keep the room minimal and do not invent major furniture.',
      ...(includedProducts.length
        ? ['', 'COMMERCIAL PRODUCT FIDELITY CONTRACT:', ...this.buildProductFidelityRules(includedProducts, allProducts)]
        : []),
      '',
      'SCENE DRESSING:',
      ...this.buildSceneDressingRules(dto),
      '',
      'COMPACT CATALOG VISUAL RULES:',
      'Preserve the recognizable identity, silhouette, proportions, construction, color and material of every listed SKU; do not genericize it.',
      'Do not replace any listed product with another category.',
      'Do not invent extra commercial furniture beyond the compact catalog list; allowed non-commercial scene dressing is still encouraged.',
      '',
      'CATALOG PRODUCT CONTROL RULES:',
      ...catalogRules,
      '',
      'SCENE COMPOSITION:',
      ...compositionRules,
      '',
      'MISSING CATEGORY RESTRICTIONS:',
      ...missingCategoryRules,
      '',
      'FINAL QUALITY TARGET:',
      'The image must look like a premium editorial residential interior photograph: cohesive, styled and believable, not a collage, sparse catalog showroom or product grid.',
      'Use soft natural light, realistic shadows, correct scale, coherent materials, clean styling and tasteful spacing.',
      'Make the room feel finished, layered and genuinely residential even when the commercial set is small; complete the atmosphere with allowed scene dressing rather than invented major furniture.',
      'Do not place product labels, text annotations, arrows, prices, brand labels or measurement text in the image.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildDeveloperPrompt(
    dto: PromptInput,
    products: Product[],
    compact: boolean,
  ) {
    const categories = this.getProductCategories(products);
    const scenePlan = dto.scenePlan;
    const roomFunction = this.buildDeveloperRoomFunction(
      dto.roomType,
      categories,
    );
    const architectureContract = this.buildDeveloperArchitectureContract(dto);
    const blueprintLines = [
      scenePlan?.designDirection
        ? `Direction: ${this.compactPromptText(scenePlan.designDirection, compact ? 100 : 180)}.`
        : null,
      scenePlan ? `Density: ${scenePlan.density}.` : null,
      scenePlan?.zones.length
        ? `Zones: ${scenePlan.zones
            .slice(0, compact ? 2 : 4)
            .map(
              (zone) =>
                `${this.compactPromptText(zone.name, 36)}=${this.compactPromptText(zone.purpose, compact ? 60 : 100)}`,
            )
            .join('; ')}.`
        : null,
      scenePlan?.placementRules.length
        ? `Placement: ${scenePlan.placementRules
            .slice(0, compact ? 3 : 6)
            .map(
              (rule) =>
                `${rule.role}=${this.compactPromptText(rule.intent, compact ? 60 : 100)}`,
            )
            .join('; ')}.`
        : null,
      scenePlan?.circulationRules.length
        ? `Circulation: ${scenePlan.circulationRules
            .slice(0, 3)
            .map((rule) => this.compactPromptText(rule, compact ? 70 : 110))
            .join('; ')}.`
        : null,
    ].filter((line): line is string => Boolean(line));
    const productLines = products.map((product, index) => {
      const profile = getProductRenderProfile(product);
      const title = this.compactPromptText(product.title, compact ? 44 : 68);
      const size =
        product.widthCm && product.heightCm && product.depthCm
          ? `${product.widthCm}x${product.heightCm}x${product.depthCm}cm`
          : '-';
      return [
        `P${index + 1}:${product.id}`,
        product.category,
        title,
        size,
        profile.subtype,
        profile.shapeHint,
        'count=1',
        'strict',
      ].join(';');
    });
    const missingRules = this.buildMissingCategoryRules(
      dto.roomType,
      categories,
    );

    return [
      ...architectureContract,
      '',
      'ROOM FUNCTION:',
      `Type=${dto.roomType}; style=${dto.style}${dto.widthCm && dto.depthCm ? `; footprint=${dto.widthCm}x${dto.depthCm}cm` : ''}${dto.heightCm ? `; ceiling=${dto.heightCm}cm` : ''}.`,
      ...roomFunction,
      '',
      'SCENE BLUEPRINT / COMPOSITION:',
      ...(blueprintLines.length
        ? blueprintLines
        : ['Use a sparse functional composition with clear circulation.']),
      '',
      'COMMERCIAL PRODUCT CONTRACT:',
      'Every Pn is a real selected SKU. Render every Pn exactly once and preserve its reference silhouette, construction, subtype, dominant color and material. Never substitute or duplicate.',
      ...productLines,
      'No unselected standalone furniture. Do not invent sofa, armchair, chair, table, desk, dresser, wardrobe, shelving, TV stand, bed or standalone storage without its selected SKU.',
      '',
      'NARROW NON-COMMERCIAL EXCEPTIONS:',
      ...this.buildDeveloperExceptionRules(dto, categories),
      '',
      'UNSELECTED CATEGORY RESTRICTIONS:',
      ...missingRules,
      '',
      'SCENE DRESSING:',
      'Allowed: curtains, bedding, pillows, restrained art, small plants, books, small vases, wall finish, baseboards and architectural/built-in lighting.',
      'Dressing stays accessory-scale and must not resemble additional purchasable furniture.',
      '',
      'QUALITY TARGET:',
      'Premium photorealistic residential interior; realistic scale, circulation, materials, natural light and shadows. No text, labels, prices, logos or watermark.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildDeveloperArchitectureContract(dto: PromptInput) {
    const spatial = dto.spatialProfile;
    const doorCount = spatial?.exactDoorCount;
    const windowCount = spatial?.exactWindowCount;
    const topologyLines = (spatial?.geometryContract ?? []).filter(
      (line, index) =>
        index > 0 &&
        !line.startsWith('Keep the cyclic wall order') &&
        !line.startsWith('Some reviewed opening widths'),
    );
    const countLine =
      doorCount !== undefined && windowCount !== undefined
        ? `Exact opening count: exactly ${doorCount} ${doorCount === 1 ? 'door' : 'doors'} and exactly ${windowCount} ${windowCount === 1 ? 'window' : 'windows'}.`
        : 'Opening count, wall assignment and relative position in REF_1 are exact.';

    return [
      'ARCHITECTURE IS IMMUTABLE — EXACT OPENING CONTRACT:',
      'REF_1 is the authoritative SOURCE_SHELL and primary/base image. Modify it only by adding selected furnishings, allowed built-ins, finishes and lighting.',
      'Preserve the provided room shell exactly. Do not add, remove, move, resize, mirror or rotate doors/windows/walls. Do not alter room proportions or camera.',
      countLine,
      windowCount === 0
        ? 'ZERO-WINDOW GUARD: this room has exactly zero windows. Do not create a window, glazed opening or daylight aperture; any rendered window is a geometry error.'
        : null,
      doorCount === 1
        ? 'ONE-DOOR GUARD: this room has exactly one door. Keep that door on its reviewed wall; any missing or additional door is a geometry error.'
        : null,
      ...topologyLines,
      'Keep the cyclic wall order and same-wall opening relationships exactly as reviewed. Furnish and style the existing architecture only.',
    ].filter((line): line is string => Boolean(line));
  }

  private buildDeveloperRoomFunction(
    roomType: RoomType,
    productCategories: Set<ProductCategory>,
  ) {
    switch (roomType) {
      case RoomType.HALLWAY:
        return [
          'Keep the real compact entry footprint; never stretch it into a long corridor. Preserve every door and keep passage clear.',
        ];
      case RoomType.BATHROOM:
        return [
          'The result must read unmistakably as a compact usable bathroom, never as a corridor.',
        ];
      case RoomType.KITCHEN:
        return [
          'The result must read unmistakably as a complete working kitchen while every opening remains untouched.',
        ];
      case RoomType.LIVING_ROOM:
        return [
          'Adapt the social composition to the existing shell and keep all door-to-door circulation clear.',
        ];
      case RoomType.BEDROOM:
        return [
          'The selected bed is the hero and must read unmistakably as a bed with a visible mattress, headboard and bedding; never render it as a sofa, daybed or bench.',
          productCategories.has(ProductCategory.ARMCHAIR)
            ? 'The selected armchair is secondary: place it as a separate corner reading seat and never merge it with or substitute it for the bed.'
            : 'Do not add accent seating or a work zone without selected SKUs.',
        ];
      default:
        return ['Keep the room function clear and respect the existing shell.'];
    }
  }

  private buildDeveloperExceptionRules(
    dto: PromptInput,
    productCategories: Set<ProductCategory>,
  ) {
    const context = new Set(dto.scenePlan?.nonCommercialContext ?? []);
    const rules: string[] = [];
    if (context.has('BATHROOM_SANITARY_CORE')) {
      rules.push(
        'B2B EXCEPTION — SANITARY CORE IS MANDATORY non-commercial context: include toilet, sink/faucet with fixed vanity and shower/bath or wet zone appropriate to the shell. These fixtures are excluded from the commercial selection.',
      );
    }
    if (context.has('KITCHEN_BUILT_IN_CORE')) {
      rules.push(
        'B2B EXCEPTION — BUILT-IN KITCHEN CORE IS MANDATORY non-commercial context: fixed cabinetry, worktop, sink/faucet, backsplash and built-in appliances may be created on real solid walls. No unselected freestanding furniture.',
      );
    }
    if (
      context.has('LIVING_ROOM_TV') &&
      productCategories.has(ProductCategory.SOFA)
    ) {
      const wall = dto.spatialProfile?.mediaWallCandidate;
      rules.push(
        wall
          ? `B2B EXCEPTION — TV ONLY: one wall-mounted TV may use solid wall ${wall.wallSegmentIndex}; no TV stand unless selected.`
          : 'B2B EXCEPTION — TV ONLY: one wall-mounted TV is allowed only when a suitable solid wall exists; no TV stand unless selected.',
      );
    }
    return rules.length > 0
      ? rules
      : ['No non-commercial furniture exception is active.'];
  }

  private validateDeveloperProductContract(
    dto: PromptInput,
    products: Product[],
  ) {
    if (!dto.sourceImageUrl) {
      throw new Error('B2B developer rendering requires a source shell image');
    }
    const plan = dto.scenePlan;
    if (!plan) return;
    const productIds = products.map(({ id }) => id);
    const selectedIds = plan.selectedProductIds;
    if (
      productIds.length !== selectedIds.length ||
      productIds.some((productId, index) => productId !== selectedIds[index])
    ) {
      throw new Error(
        'B2B developer selected products do not match CuratedScenePlan',
      );
    }
    const selectedSet = new Set(selectedIds);
    if (
      plan.roleAssignments.some(
        ({ productId }) => !selectedSet.has(productId),
      )
    ) {
      throw new Error(
        'B2B developer role assignment references an unselected product',
      );
    }
  }

  private compactPromptText(value: string, maxLength: number) {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length <= maxLength
      ? compact
      : `${compact.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  }

  private buildUltraCompactPrompt(dto: PromptInput, products: Product[]) {
    const categories = this.getProductCategories(products);
    const scenePlan = dto.scenePlan;
    const spatial = dto.spatialProfile;
    const hero = this.getHeroProduct(dto.roomType, products);
    const missingMajor = [
      ProductCategory.SOFA,
      ProductCategory.BED,
      ProductCategory.ARMCHAIR,
      ProductCategory.CHAIR,
      ProductCategory.COFFEE_TABLE,
      ProductCategory.TABLE,
      ProductCategory.TV_STAND,
      ProductCategory.WARDROBE,
      ProductCategory.DRESSER,
      ProductCategory.SHELF,
      ProductCategory.DESK,
    ].filter((category) => !categories.has(category));

    const productLines = products.map((product, index) => {
      const profile = getProductRenderProfile(product);
      const title = product.title.replace(/\s+/g, ' ').trim().slice(0, 72);
      const size =
        product.widthCm && product.heightCm && product.depthCm
          ? `${product.widthCm}x${product.heightCm}x${product.depthCm}cm`
          : '-';
      const appearance = [
        product.color && product.color !== 'Не указан'
          ? `color=${product.color}`
          : null,
        product.material ? `material=${product.material}` : null,
      ]
        .filter(Boolean)
        .join(';');

      return [
        `PRODUCT_${index + 1}`,
        `category=${product.category}`,
        `title=${title}`,
        `size=${size}`,
        appearance || null,
        `priority=${profile.priority}`,
        `subtype=${profile.subtype}`,
        `placement=${profile.placement}`,
        `shape=${profile.shapeHint}`,
        'count=1',
        'duplicate=FORBIDDEN',
      ]
        .filter(Boolean)
        .join('; ');
    });

    const blueprint = scenePlan
      ? [
          scenePlan.renderNarrative?.roomStory
            ? `story=${scenePlan.renderNarrative.roomStory.slice(0, 220)}`
            : null,
          `direction=${scenePlan.designDirection.slice(0, 160)}`,
          `density=${scenePlan.density}`,
          scenePlan.zones.length
            ? `zones=${scenePlan.zones
                .slice(0, 4)
                .map((zone) => zone.name)
                .join(',')}`
            : null,
          scenePlan.circulationRules.length
            ? `circulation=${scenePlan.circulationRules
                .slice(0, 3)
                .join('; ')}`
            : null,
        ]
          .filter(Boolean)
          .join('; ')
      : null;

    const geometry = spatial
      ? [
          `size=${spatial.sizeClass}`,
          spatial.aspectRatio ? `aspect=${spatial.aspectRatio}` : null,
          spatial.longWallCm ? `longWall=${spatial.longWallCm}cm` : null,
          spatial.usableSolidWallCm
            ? `usableWall=${spatial.usableSolidWallCm}cm`
            : null,
          spatial.mediaWallCandidate
            ? `mediaWall=wall:${spatial.mediaWallCandidate.wallSegmentIndex}/${spatial.mediaWallCandidate.usableCm}cm`
            : null,
        ]
          .filter(Boolean)
          .join('; ')
      : null;

    return [
      'Create a premium photorealistic residential interior using the source room and every selected catalog SKU.',
      `ROOM: type=${dto.roomType}; style=${dto.style}; ${dto.widthCm && dto.depthCm ? `footprint=${dto.widthCm}x${dto.depthCm}cm; ` : ''}${dto.heightCm ? `height=${dto.heightCm}cm` : ''}`,
      dto.sourceImageUrl
        ? 'SOURCE ROOM IS STRICT: preserve camera, walls, windows, doors, floor, ceiling and proportions.'
        : null,
      blueprint ? `BLUEPRINT: ${blueprint}.` : null,
      geometry ? `GEOMETRY: ${geometry}.` : null,
      scenePlan?.renderNarrative
        ? `SPATIAL CONTRACT: ${scenePlan.renderNarrative.geometryRules.join(' ')} ${scenePlan.renderNarrative.cameraRule} ${scenePlan.renderNarrative.focalRelationships.join(' ')}`
        : null,
      '',
      'COMMERCIAL PRODUCTS — HARD CONTRACT:',
      ...productLines,
      '',
      'PRODUCT FIDELITY:',
      'The listed products are the only purchasable furniture. Use every PRODUCT_n exactly once. Attached product references are identity references, not inspiration.',
      'Preserve recognizable silhouette, proportions, construction, dominant color/material and subtype. Never genericize, substitute or duplicate a selected SKU.',
      hero
        ? `The selected ${hero.category} is the hero object and must be clearly visible and recognizable.`
        : null,
      'Reference product images may be attached; match PRODUCT_n to the provider attachment map when present.',
      '',
      'COMPOSITION:',
      dto.roomType === RoomType.LIVING_ROOM && categories.has(ProductCategory.SOFA)
        ? 'The sofa is the hero object. Build a natural social composition around it.'
        : null,
      dto.roomType === RoomType.BEDROOM && categories.has(ProductCategory.BED)
        ? 'The bed is the hero object. Build a calm sleeping composition around it.'
        : null,
      'Respect the blueprint, circulation and realistic object scale. Selected products may be arranged creatively, but their identity may not be redesigned.',
      '',
      'SCENE DRESSING:',
      'Make the room finished and editorial with curtains, bedding/throws where appropriate, restrained artwork, plants, books, vases, wall finish, baseboards and discreet built-in/recessed lighting.',
      'Scene dressing must stay accessory-scale: no extra stools, poufs, ottomans, tables, shelves, cabinets, floor lamps, chairs, armchairs, sofas, beds or other furniture-height floor objects.',
      missingMajor.length
        ? `UNSELECTED MAJOR CATEGORIES ARE FORBIDDEN: ${missingMajor.join(', ')}.`
        : null,
      ...this.buildNonCommercialContextRules(dto, categories),
      '',
      'FINAL QUALITY TARGET:',
      'Premium editorial residential photo; realistic perspective, scale, materials, shadows and natural light. No labels, prices, logos, annotations or measurement text.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildEssentialCatalogPrompt(
    dto: PromptInput,
    products: Product[],
  ) {
    const categories = this.getProductCategories(products);
    const lines = products.map((product, index) => {
      const profile = getProductRenderProfile(product);
      const title = product.title.replace(/\s+/g, ' ').trim().slice(0, 48);
      const size =
        product.widthCm && product.heightCm && product.depthCm
          ? `${product.widthCm}x${product.heightCm}x${product.depthCm}`
          : '-';
      return `P${index + 1}:${product.category};${title};${size};${profile.subtype};${profile.shapeHint};once;strict`;
    });

    return [
      `ROOM:${dto.roomType};STYLE:${dto.style};${dto.widthCm && dto.depthCm ? `SIZE:${dto.widthCm}x${dto.depthCm};` : ''}${dto.heightCm ? `H:${dto.heightCm}` : ''}`,
      dto.sourceImageUrl
        ? 'SOURCE STRICT: preserve shell, openings, proportions and camera.'
        : 'Use realistic room proportions.',
      dto.scenePlan
        ? `PLAN:${dto.scenePlan.designDirection.slice(0, 100)};DENSITY:${dto.scenePlan.density}`
        : null,
      dto.spatialProfile?.mediaWallCandidate
        ? `SOLID_MEDIA_WALL:${dto.spatialProfile.mediaWallCandidate.wallSegmentIndex}/${dto.spatialProfile.mediaWallCandidate.usableCm}cm`
        : null,
      dto.scenePlan?.renderNarrative
        ? `SHELL:${dto.scenePlan.renderNarrative.geometryRules.join(' ')} CAMERA:${dto.scenePlan.renderNarrative.cameraRule} REL:${dto.scenePlan.renderNarrative.focalRelationships.join(' ')}`
        : null,
      'CATALOG CONTRACT: every Pn is a real selected SKU. Render each exactly once; preserve reference silhouette, construction, color/material and subtype. Never substitute or duplicate. No unselected freestanding furniture.',
      ...lines,
      ...this.buildNonCommercialContextRules(dto, categories),
      'DRESSING: curtains, textiles, restrained art/plants/books/vases, wall finish and recessed/indirect light only. No extra furniture-height objects.',
      'QUALITY: finished premium residential photo; realistic scale, circulation, perspective, materials and light; no text/logos.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildSceneGuidance(dto: PromptInput, products: Product[]) {
    const plan = dto.scenePlan;
    const spatial = dto.spatialProfile;
    if (!plan && !spatial) return [];

    const lines: string[] = [];
    const renderNarrative = plan?.renderNarrative;
    if (renderNarrative) {
      lines.push(`Room narrative: ${renderNarrative.roomStory}`);
      lines.push(`Geometry contract: ${renderNarrative.geometryRules.join(' ')}`);
      lines.push(`Camera contract: ${renderNarrative.cameraRule}`);
      if (renderNarrative.focalRelationships.length > 0) {
        lines.push(
          `Spatial relationships: ${renderNarrative.focalRelationships.join(' ')}`,
        );
      }
    }
    if (plan) {
      const designDirection = plan.designDirection;
      lines.push(
        `Design direction: ${designDirection}. Density: ${plan.density} (density=${plan.density}).`,
      );
      const zones = plan.zones.map(
        ({ name, purpose }) => `${name}: ${purpose}`,
      );
      if (zones.length > 0) {
        lines.push(`Zones: ${zones.slice(0, 4).join('; ')}.`);
      }
      for (const rule of plan.placementRules ?? []) {
        lines.push(`Placement for role ${rule.role}: ${rule.intent}.`);
      }
      for (const placement of plan.placementHints.slice(0, 5)) {
        const target = placement.productId
          ? `product ${placement.productId}`
          : placement.role
            ? `role ${placement.role}`
          : placement.category
            ? `category ${placement.category}`
            : 'selected product';
        lines.push(`Placement for ${target}: ${placement.hint}.`);
      }
      const selectedProductIds = new Set(plan.selectedProductIds);
      const selectedLightingSubtypes = new Set(
        products
          .filter((product) => selectedProductIds.has(product.id))
          .map((product) => classifyProductSemantics(product))
          .filter(({ functionRole }) => functionRole === 'LIGHTING')
          .map(({ subtype }) => subtype),
      );
      if (selectedLightingSubtypes.has('PENDANT')) {
        lines.push(
          'Selected pendant: use as a ceiling-mounted secondary fixture; do not hang it unrealistically low; preserve realistic ceiling clearance.',
        );
        if (dto.roomType === RoomType.BEDROOM) {
          lines.push(
            'Do not place it directly over the bed unless naturally appropriate.',
          );
        }
      }
      if (selectedLightingSubtypes.has('TABLE_LAMP')) {
        lines.push(
          'Selected table lamp: place on a suitable bedside or dresser surface.',
        );
      }
      if (selectedLightingSubtypes.has('FLOOR_LAMP')) {
        lines.push(
          'Selected floor lamp: place on the floor near a reading or seating zone, never floating.',
        );
      }
      if (selectedLightingSubtypes.has('WALL_LAMP')) {
        lines.push(
          'Selected wall lamp: keep wall-mounted at a realistic height.',
        );
      }
      lines.push(...this.buildNonCommercialContextRules(dto, this.getProductCategories(products)));
    }
    if (spatial) {
      const geometry = [
        `size=${spatial.sizeClass}`,
        spatial.widthCm && spatial.depthCm
          ? `footprint=${Math.round(spatial.widthCm)}x${Math.round(spatial.depthCm)}cm`
          : null,
        spatial.areaM2 ? `area=${spatial.areaM2.toFixed(1)}m2` : null,
        spatial.aspectRatio ? `aspect=${spatial.aspectRatio}` : null,
        spatial.longWallCm ? `longWall=${spatial.longWallCm}cm` : null,
        spatial.usableSolidWallCm
          ? `usableSolidWall=${spatial.usableSolidWallCm}cm`
          : null,
        `source=${spatial.source}`,
      ]
        .filter(Boolean)
        .join(', ');
      lines.push(`Reviewed geometry: ${geometry}.`);
      if (spatial.windowPositions.length > 0) {
        lines.push(`Keep windows clear: ${spatial.windowPositions.join(', ')}.`);
      }
      if (spatial.doorPositions.length > 0) {
        lines.push(`Keep door paths clear: ${spatial.doorPositions.join(', ')}.`);
      }
      if (spatial.mediaWallCandidate) {
        lines.push(
          `Best reviewed solid-wall candidate: wall ${spatial.mediaWallCandidate.wallSegmentIndex}, usable width ${spatial.mediaWallCandidate.usableCm} cm.`,
        );
      }
      const circulation = Array.from(
        new Set([
          ...(plan?.circulationRules ?? []),
          ...spatial.circulationConstraints,
        ]),
      );
      if (circulation.length > 0) {
        lines.push(
          `Circulation: ${circulation.join('; ')}.`,
        );
      }
    } else if (plan?.circulationRules?.length) {
      lines.push(`Circulation: ${plan.circulationRules.join('; ')}.`);
    }

    return lines.slice(0, 16);
  }

  private buildProductLines(products: Product[]) {
    return products
      .slice(0, 12)
      .map((product, index) => {
        const categoryLabel = PRODUCT_CATEGORY_LABELS[product.category];

        return [
          `PRODUCT_${index + 1}; ID=${product.id}`,
          `CATEGORY=${product.category} (${categoryLabel})`,
          `TITLE=${product.title}`,
          product.description ? `DESCRIPTION=${product.description}` : null,
          product.color && product.color !== 'Не указан'
            ? `COLOR=${product.color}`
            : null,
          product.material ? `MATERIAL=${product.material}` : null,
          product.widthCm && product.depthCm && product.heightCm
            ? `SIZE_WxHxD=${product.widthCm}x${product.heightCm}x${product.depthCm} cm`
            : null,
          `PRICE=${product.price} RUB`,
          product.styleTags.length
            ? `CATALOG_STYLES=${product.styleTags.join(', ')}`
            : null,
          product.roomTypes.length
            ? `CATALOG_ROOMS=${product.roomTypes.join(', ')}`
            : null,
          'VISUAL_RULE=This is a specific commercial SKU, not inspiration. Match the attached reference when available: preserve recognizable silhouette, proportions, construction, color and material. Use exactly once and do not substitute it with a generic item of the same category.',
        ]
          .filter(Boolean)
          .join('; ');
      })
      .join('\n');
  }

  private buildCompactProductLines(
    products: Product[],
    allProducts: Product[] = products,
  ) {
    const productIndexById = new Map(
      allProducts.map((product, index) => [product.id, index]),
    );

    return products
      .map((product, index) => {
        const categoryLabel = PRODUCT_CATEGORY_LABELS[product.category];
        const compactDescription = product.description
          ? this.truncateCompactDescription(
              product.description,
              COMPACT_DESCRIPTION_MAX_LENGTH,
            )
          : null;

        return [
          `PRODUCT_${(productIndexById.get(product.id) ?? index) + 1}; CATEGORY=${product.category} (${categoryLabel})`,
          `TITLE=${product.title}`,
          product.color && product.color !== 'Не указан'
            ? `COLOR=${product.color}`
            : null,
          product.material ? `MATERIAL=${product.material}` : null,
          product.widthCm && product.depthCm && product.heightCm
            ? `SIZE_WxHxD=${product.widthCm}x${product.heightCm}x${product.depthCm} cm`
            : null,
          compactDescription ? `DESCRIPTION=${compactDescription}` : null,
          `VISUAL_RULE=Specific SKU; preserve reference identity and use exactly once as ${product.category}.`,
        ]
          .filter(Boolean)
          .join('; ');
      })
      .join('\n');
  }

  private truncateCompactDescription(value: string, maxLength: number) {
    const compactValue = value.replace(/\s+/g, ' ').trim();

    if (compactValue.length <= maxLength) return compactValue;
    if (maxLength <= 3) return compactValue.substring(0, maxLength);

    return `${compactValue.substring(0, maxLength - 3).trimEnd()}...`;
  }

  private getHeroProduct(roomType: RoomType, products: Product[]) {
    const heroCategory = ROOM_HERO_CATEGORY[roomType];

    if (!heroCategory) return undefined;

    return products.find((product) => product.category === heroCategory);
  }

  private buildProductFidelityRules(
    products: Product[],
    allProducts: Product[] = products,
  ) {
    const productIndexById = new Map(
      allProducts.map((product, index) => [product.id, index]),
    );
    const rules = [
      'Render fidelity has higher priority than decorative creativity: the room may be styled freely around the products, but the selected commercial SKUs themselves must stay recognizable.',
      'PRODUCT_1, PRODUCT_2, etc. are stable product labels. If the provider supplies an ATTACHMENT MAP, use it to match each PRODUCT_n to its exact reference image.',
      'Never replace a selected SKU with a more generic object of the same category. Never duplicate one selected SKU to create symmetry or fill space.',
      'HERO and STRUCTURAL products must remain clearly recognizable by silhouette, proportions, construction and dominant color/material. SUPPORT products must preserve object type, placement and recognizable visual identity.',
    ];

    for (const [index, product] of products.entries()) {
      const profile = getProductRenderProfile(product);
      rules.push(
        [
          `PRODUCT_${(productIndexById.get(product.id) ?? index) + 1}`,
          `priority=${profile.priority}`,
          `category=${product.category}`,
          `subtype=${profile.subtype}`,
          `placement=${profile.placement}`,
          `shape=${profile.shapeHint}`,
          'count=1',
          `must_be_visible=${profile.mustBeVisible ? 'yes' : 'preferred'}`,
          `reference_fidelity=${profile.exactReferenceFidelity ? 'STRICT' : 'HIGH'}`,
          'duplicate=FORBIDDEN',
        ].join('; '),
      );
    }

    return rules;
  }

  private buildCatalogRules(
    dto: PromptInput,
    products: Product[],
    productCategories: Set<ProductCategory>,
  ) {
    const rules = [
      'COMMERCIAL FURNITURE CONTRACT: the listed commercial products are the only purchasable major furniture objects; every major freestanding furniture object must come from them.',
      'Integrate every selected product naturally into the composition exactly once. Each selected SKU must remain visually recognizable; artistic composition must adapt around the product rather than redesigning the product.',
      'Do not add an unselected sofa, bed, wardrobe, cabinet, table, desk, chair, armchair, shelf or other major freestanding furniture.',
      'Non-commercial scene dressing is allowed and encouraged when it makes the room feel complete, lived-in and editorial; it must stay secondary to the catalog furniture.',
      'Do not change a product category into another category. A BED must look like a bed, not a sofa. A SOFA must look like a sofa, not a bed. A DESK must look like a desk, not a dining table.',
      'When the commercial set is small, enrich the room through textiles, window treatment, wall styling, small accessories and architectural light rather than leaving a sterile showroom or inventing major furniture.',
      'Reference product images may be attached. They are identity references for the selected SKUs, not loose inspiration. Preserve distinctive silhouette, proportions, section count, frame/base construction, dominant color and material whenever visible.',
    ];

    if (products.length <= 4) {
      rules.push(
        'The commercial set is intentionally concise: make the scene visually complete through rich but tasteful soft styling, not through additional major furniture.',
      );
    }

    if (
      dto.roomType === RoomType.BEDROOM &&
      productCategories.has(ProductCategory.BED)
    ) {
      rules.push(
        'The selected BED is the main object of this bedroom. Render it clearly as a real bed with a mattress, pillows and headboard. Never replace it with a sofa or couch.',
      );
    }

    if (
      dto.roomType === RoomType.LIVING_ROOM &&
      productCategories.has(ProductCategory.SOFA)
    ) {
      rules.push(
        'The selected SOFA is the main object of this living room. Render it clearly as a sofa/couch seating area. Never replace it with a bed.',
      );
    }

    return rules;
  }

  private buildSceneDressingRules(dto: PromptInput) {
    const rules = [
      'Create a finished residential interior, not a sparse catalog showroom.',
      'Use layered textiles where appropriate, full-height curtains or soft window treatment, coherent wall finish, baseboards, restrained artwork, small plants, books, vases and a few small accessories.',
      'Architectural lighting may include discreet recessed, cove or indirect illumination, but do not invent a prominent standalone decorative lamp that could be mistaken for a catalog product.',
      'Scene dressing must stay accessory-scale and may not create extra purchasable furniture.',
      'Never create unselected stools, poufs, ottomans, side tables, coffee tables, freestanding shelves, cabinets, floor lamps, chairs, armchairs, sofas, beds or other furniture-height floor objects.',
    ];

    rules.push(
      ...this.buildNonCommercialContextRules(
        dto,
        new Set<ProductCategory>(),
      ),
    );

    return rules;
  }

  private buildNonCommercialContextRules(
    dto: PromptInput,
    productCategories: Set<ProductCategory>,
  ) {
    const context = new Set(dto.scenePlan?.nonCommercialContext ?? []);
    const rules: string[] = [];

    if (context.has('BATHROOM_SANITARY_CORE')) {
      rules.push(
        'B2B EXCEPTION — SANITARY CORE IS MANDATORY: this image must unmistakably show a complete usable bathroom even when the catalog has no sanitary supplier. Include one toilet, one sink with a compact fixed/built-in vanity, one mirror area, faucet, and a shower/wet zone or bath appropriate to the reviewed footprint. In a narrow elongated bathroom keep the entrance clear, place the wet zone toward the far end, and align sanitary fixtures to real solid walls. These fixtures are non-commercial context only and are excluded from the product selection.',
      );
    }

    if (context.has('KITCHEN_BUILT_IN_CORE')) {
      rules.push(
        'B2B EXCEPTION — BUILT-IN KITCHEN CORE IS MANDATORY: the room must visibly read as a complete kitchen, not as a dining room with a table. Create one coherent fixed kitchen run on a real opening-free wall: base/tall cabinetry, worktop, backsplash, sink/faucet and essential fixed appliances; add upper cabinetry only when spatially believable. This fixed kitchen core is non-commercial context. Freestanding table, chairs, shelves, lamps and all other furniture must still come only from selected catalog products.',
      );
    }

    if (
      context.has('LIVING_ROOM_TV') &&
      productCategories.has(ProductCategory.SOFA)
    ) {
      const wall = dto.spatialProfile?.mediaWallCandidate;
      rules.push(
        wall
          ? `B2B EXCEPTION — TV ONLY: create exactly one wall-mounted television on reviewed opening-free wall ${wall.wallSegmentIndex} (about ${wall.usableCm} cm usable). Make this the living-room media focal wall and orient the selected sofa/viewing axis toward it while preserving circulation. Never move the TV to a window/door wall. The TV is non-commercial; do not invent a TV stand or media cabinet unless one is selected from catalog.`
          : 'B2B EXCEPTION — TV ONLY: if a suitable solid wall without windows/openings exists opposite or naturally facing the sofa, create one wall-mounted television there. The TV is non-commercial; do not invent a TV stand or media cabinet unless one is selected from catalog.',
      );
    }

    return rules;
  }

  private buildRoomInstructions(
    dto: PromptInput,
    productCategories: Set<ProductCategory>,
  ) {
    switch (dto.roomType) {
      case RoomType.BEDROOM:
        return [
          'This must look unmistakably like a bedroom, not a living room.',
          productCategories.has(ProductCategory.BED)
            ? 'The bed is the hero object. Place the bed as the primary focal point against the main wall or in the most natural sleeping-zone position.'
            : 'If no BED product is selected, do not fake the bedroom with a sofa. Keep the room sparse and avoid living-room furniture.',
          'Use calm, cozy bedroom styling: soft textiles, balanced symmetry, warm natural light and restful composition.',
          'Do not place a sofa/couch in the bedroom unless a SOFA product is explicitly selected, which should normally not happen for a bedroom.',
          'Do not create a living room scene, TV lounge, office lounge or sofa seating composition.',
        ];

      case RoomType.LIVING_ROOM:
        return [
          'This must look unmistakably like a living room, not a bedroom.',
          productCategories.has(ProductCategory.SOFA)
            ? 'The sofa is the hero object. Place it as the primary seating area and build the composition around it.'
            : 'If no SOFA product is selected, keep the living room sparse and do not invent a sofa.',
          ...(dto.scenePlan?.nonCommercialContext?.includes('LIVING_ROOM_TV')
            ? this.buildNonCommercialContextRules(dto, productCategories)
            : []),
          'Use a comfortable social layout with realistic walking space and natural viewing angles. Keep selected surface/storage/textile support products visually connected to the sofa instead of isolating the sofa in an otherwise empty room.',
          'Do not place a bed, mattress or bedroom sleeping area in the living room.',
        ];

      case RoomType.STUDIO:
        return [
          'This must look like a compact studio apartment zone with clear, functional zoning.',
          'Use the selected products to create a practical living/sleeping/work area without clutter.',
          'Do not invent large additional furniture to fill the studio. Keep empty space if the catalog set is limited.',
        ];

      case RoomType.KITCHEN:
        return [
          'This must look unmistakably like a complete working kitchen; a dining-only composition is a failure.',
          ...(dto.scenePlan?.nonCommercialContext?.includes('KITCHEN_BUILT_IN_CORE')
            ? this.buildNonCommercialContextRules(dto, productCategories)
            : []),
          productCategories.has(ProductCategory.TABLE)
            ? 'The selected TABLE is the commercial dining anchor and must remain recognizable.'
            : 'If no TABLE product is selected, do not invent a freestanding dining table.',
          'Do not invent freestanding chairs, storage, shelves or decorative furniture unless selected from catalog.',
          'Do not place beds, sofas or bedroom furniture in the kitchen.',
        ];

      case RoomType.OFFICE:
        return [
          'This must look unmistakably like a home office or workspace.',
          productCategories.has(ProductCategory.DESK)
            ? 'The selected DESK is the main object. Place it in a realistic working position with comfortable space around it.'
            : 'If no DESK product is selected, do not invent a desk.',
          'Do not turn the office into a living room, bedroom or dining room.',
        ];

      case RoomType.KIDS_ROOM:
        return [
          'This must look like a clean, safe and practical kids room.',
          'Use functional zoning for sleep, storage and study only if the corresponding catalog products are selected.',
          'Avoid clutter, random toys and unlisted decorative objects.',
        ];

      case RoomType.HALLWAY: {
        const spatial = dto.spatialProfile;
        const isVerySmall =
          spatial?.sizeClass === 'SMALL' ||
          (spatial?.areaM2 !== undefined && spatial.areaM2 < 4);
        return [
          'This must read as the exact entry/hallway from the reviewed shell, not as a generic rectangular corridor.',
          isVerySmall
            ? `VERY SMALL ENTRY SCALE: ${spatial?.widthCm && spatial?.depthCm ? `${Math.round(spatial.widthCm)}×${Math.round(spatial.depthCm)} cm` : 'under 4 m²'}. Keep the camera close to the real walls; do not create a long hallway perspective, widen the vestibule or visually extend it beyond the reviewed footprint.`
            : 'Preserve the reviewed hallway length/width relationship; do not widen or extend it for a more dramatic perspective.',
          'Door locations and the sequence of connected openings are architectural anchors: preserve them exactly and keep a clear path from the entrance to every doorway.',
          'Place only selected catalog storage/mirror/bench/hanger against real usable wall segments; never float storage in the passage or cover an opening.',
          'Make the sparse hallway feel designed through wall color/texture, a restrained accent panel around selected wall accents, baseboards and discreet recessed/linear architectural light rather than invented furniture.',
          'Do not mirror or straighten an irregular hallway and do not create a lounge composition.',
        ];
      }

      case RoomType.BATHROOM:
        return [
          'This must look unmistakably like a complete usable bathroom; an empty room with only a mirror/rug/decor is a failure.',
          ...(dto.scenePlan?.nonCommercialContext?.includes('BATHROOM_SANITARY_CORE')
            ? this.buildNonCommercialContextRules(dto, productCategories)
            : [
                'Do not invent sanitary or furniture products that are not selected.',
              ]),
          'Do not add freestanding cabinets, chairs, sofas, tables, shelves or other commercial furniture unless that exact category is present in the selected catalog products.',
          'Keep the room compact, functional and realistic; preserve the reviewed footprint and circulation.',
        ];

      default:
        return [
          'Make the room type clear and functional.',
          'Use the selected products with realistic scale and spacing.',
        ];
    }
  }

  private buildCompositionRules(
    roomType: RoomType,
    productCategories: Set<ProductCategory>,
  ) {
    const rules: string[] = [];

    if (productCategories.has(ProductCategory.BED)) {
      rules.push(
        'Place the selected BED as a bed: horizontal sleeping surface, mattress, pillows and headboard. It must not look like a sofa bench.',
      );
    }

    if (productCategories.has(ProductCategory.SOFA)) {
      rules.push(
        'Place the selected SOFA as sofa seating: backrest, seat cushions, armrests if present, living-room scale. It must not look like a bed.',
      );
    }

    if (productCategories.has(ProductCategory.COFFEE_TABLE)) {
      rules.push(
        'Place the selected COFFEE_TABLE in front of the sofa or seating area.',
      );
    }

    if (productCategories.has(ProductCategory.TV_STAND)) {
      rules.push(
        'Place the selected TV_STAND against a wall as a media console.',
      );
    }

    if (productCategories.has(ProductCategory.WARDROBE)) {
      rules.push(
        'Place the selected WARDROBE as a large vertical storage cabinet along a wall.',
      );
    }

    if (productCategories.has(ProductCategory.DRESSER)) {
      rules.push(
        'Place the selected DRESSER/chest of drawers along a side wall or near the bed/entry zone.',
      );
    }

    if (productCategories.has(ProductCategory.SHELF)) {
      rules.push(
        'Place the selected SHELF/bookcase along a wall. Do not add extra shelves beyond selected shelf products.',
      );
    }

    if (productCategories.has(ProductCategory.DESK)) {
      rules.push(
        'Place the selected DESK near a wall or window as a functional workspace.',
      );
    }

    if (productCategories.has(ProductCategory.RUG)) {
      rules.push(
        'Place the selected RUG under the main furniture group with correct scale and perspective.',
      );
    }

    if (productCategories.has(ProductCategory.LAMP)) {
      rules.push(
        'Use each selected LAMP according to its semantic placement guidance and keep it secondary unless the scene direction explicitly makes lighting the accent.',
      );
    }

    if (productCategories.has(ProductCategory.ARMCHAIR)) {
      const roomPriority =
        roomType === RoomType.BEDROOM
          ? 'In a bedroom it is secondary to the bed and storage.'
          : roomType === RoomType.LIVING_ROOM
            ? 'In a living room it is secondary to the sofa and core seating group.'
            : 'It is secondary to the room\'s core functional composition.';

      rules.push(
        `Place the selected ARMCHAIR at most once as a secondary seating accent. ${roomPriority} Do not force it into the scene if that blocks circulation or breaks a realistic functional layout, and never repeat it as a default room template.`,
      );
    }

    if (rules.length === 0) {
      rules.push(
        'Use a sparse, clean composition and avoid inventing missing furniture.',
      );
    }

    if (roomType === RoomType.BEDROOM) {
      rules.push(
        'Bedroom composition priority: bed first, then wardrobe/dresser, then lighting/rug/decor if selected.',
      );
    }

    if (roomType === RoomType.LIVING_ROOM) {
      rules.push(
        'Living room composition priority: sofa first, then coffee table, TV stand/shelf, rug, lighting and decor if selected.',
      );
    }

    return rules;
  }

  private buildMissingCategoryRules(
    roomType: RoomType,
    productCategories: Set<ProductCategory>,
  ) {
    const rules: string[] = [];

    const forbidIfMissing = (category: ProductCategory, message: string) => {
      if (!productCategories.has(category)) rules.push(message);
    };

    forbidIfMissing(
      ProductCategory.SOFA,
      'No SOFA product is selected: do not add any sofa, couch, sectional or loveseat.',
    );
    forbidIfMissing(
      ProductCategory.BED,
      'No BED product is selected: do not add any bed, mattress bedframe or sleeping furniture.',
    );
    forbidIfMissing(
      ProductCategory.ARMCHAIR,
      'No ARMCHAIR product is selected: do not add armchairs or lounge chairs.',
    );
    forbidIfMissing(
      ProductCategory.CHAIR,
      'No CHAIR product is selected: do not add extra chairs.',
    );
    forbidIfMissing(
      ProductCategory.COFFEE_TABLE,
      'No COFFEE_TABLE product is selected: do not add coffee tables.',
    );
    forbidIfMissing(
      ProductCategory.TABLE,
      'No TABLE product is selected: do not add dining tables or large tables.',
    );
    forbidIfMissing(
      ProductCategory.TV_STAND,
      'No TV_STAND product is selected: do not add TV stands or media consoles.',
    );
    forbidIfMissing(
      ProductCategory.WARDROBE,
      'No WARDROBE product is selected: do not add wardrobes or large storage cabinets.',
    );
    forbidIfMissing(
      ProductCategory.DRESSER,
      'No DRESSER product is selected: do not add dressers, chests of drawers or sideboards.',
    );
    forbidIfMissing(
      ProductCategory.SHELF,
      'No SHELF product is selected: do not add shelves, bookcases or storage racks.',
    );
    forbidIfMissing(
      ProductCategory.DESK,
      'No DESK product is selected: do not add desks or work tables.',
    );
    forbidIfMissing(
      ProductCategory.RUG,
      'No RUG product is selected: do not add rugs or carpets.',
    );
    forbidIfMissing(
      ProductCategory.LAMP,
      'No LAMP product is selected: do not add a visible standalone lamp, chandelier or pendant as a commercial-looking object; subtle built-in or indirect architectural illumination is allowed.',
    );
    forbidIfMissing(
      ProductCategory.DECOR,
      'No DECOR product is selected: do not add a large decorative hero object presented as a purchasable product; normal non-commercial artwork, books, plants and small styling accessories from SCENE DRESSING are allowed.',
    );

    if (roomType === RoomType.BEDROOM) {
      rules.push(
        'Bedroom-specific restriction: never use a sofa/couch as a substitute for a bed.',
      );
    }

    if (roomType === RoomType.LIVING_ROOM) {
      rules.push(
        'Living-room-specific restriction: never use a bed as a substitute for a sofa.',
      );
    }

    return rules;
  }

  private buildStyleInstructions(style: InteriorStyle) {
    switch (style) {
      case InteriorStyle.MINIMALISM:
        return [
          'Minimalism: clean composition, few objects, calm neutral palette, simple silhouettes, hidden clutter, lots of breathing space.',
          'Avoid ornate decor, excessive patterns and visual noise.',
        ];

      case InteriorStyle.MODERN:
        return [
          'Modern style: clean contemporary furniture, balanced proportions, warm neutrals, subtle contrast, practical layout and premium simplicity.',
          'Avoid outdated ornate details and chaotic eclectic styling.',
        ];

      case InteriorStyle.SCANDI:
        return [
          'Scandinavian style: light wood, soft whites, beige and grey tones, cozy textiles, natural daylight and simple functional forms.',
          'Keep the room bright, airy, warm and uncluttered.',
        ];

      case InteriorStyle.JAPANDI:
        return [
          'Japandi style: Japanese minimal calm plus Scandinavian warmth, low visual noise, natural materials, warm beige/wood palette and balanced negative space.',
          'Avoid glossy luxury, heavy ornament and clutter.',
        ];

      case InteriorStyle.ECO:
        return [
          'Eco style: natural materials, wood textures, linen-like textiles, soft earthy palette, calm organic feeling and sustainable simplicity.',
          'Avoid plastic-looking furniture, cold high-tech surfaces and excessive decor.',
        ];

      case InteriorStyle.LOFT:
        return [
          'Loft style: industrial mood, metal and wood, darker accents, brick/concrete if appropriate, bold simple furniture and open space.',
          'Avoid classic ornate furniture unless it is explicitly selected in the catalog.',
        ];

      case InteriorStyle.HIGH_TECH:
        return [
          'High-tech style: sleek modern lines, monochrome palette, glass/metal accents, clean lighting, minimal decor and futuristic precision.',
          'Avoid rustic, vintage or ornate classic details.',
        ];

      case InteriorStyle.CLASSIC:
        return [
          'Classic style: elegant symmetrical composition, refined proportions, warm cream/ivory palette, tasteful molding-like details, graceful furniture lines and soft premium lighting.',
          'Keep it realistic and not palace-like. Avoid overdecorated luxury, gold overload and museum-like interiors.',
        ];

      case InteriorStyle.NEOCLASSIC:
        return [
          'Neoclassic style: modern classic elegance, wall moldings if suitable, calm beige/cream/grey palette, symmetrical but light composition, refined furniture and premium restraint.',
          'Avoid heavy baroque, excessive gold, clutter and old-fashioned palace styling.',
        ];

      case InteriorStyle.PROVENCE:
        return [
          'Provence style: soft romantic countryside elegance, warm whites, cream, light wood, gentle textile textures, graceful shapes and cozy natural light.',
          'Avoid dark industrial elements, glossy high-tech and heavy modern minimalism.',
        ];

      default:
        return [
          'Use a coherent interior style with consistent colors, materials, lighting and furniture shapes.',
        ];
    }
  }

  private buildRoomNegativePrompt(roomType?: RoomType) {
    switch (roomType) {
      case RoomType.BEDROOM:
        return [
          'sofa instead of bed',
          'couch instead of bed',
          'living room sofa',
          'sectional sofa',
          'coffee table in bedroom',
          'tv lounge bedroom',
          'bedroom without bed',
        ];

      case RoomType.LIVING_ROOM:
        return [
          'bed in living room',
          'mattress in living room',
          'bedroom scene',
          'sofa replaced by bed',
        ];

      case RoomType.KITCHEN:
        return [
          'bed in kitchen',
          'sofa in kitchen',
          'bedroom kitchen',
          'living room kitchen',
        ];

      case RoomType.OFFICE:
        return [
          'bed in office',
          'sofa as main office object',
          'living room office',
          'bedroom office',
        ];

      case RoomType.HALLWAY:
        return [
          'bed in hallway',
          'sofa in hallway',
          'lounge furniture in hallway',
          'blocked hallway circulation',
          'wide-angle expanded hallway',
          'large furniture in hallway center',
        ];

      case RoomType.BATHROOM:
        return [
          'sofa in bathroom',
          'chair in bathroom',
          'freestanding cabinet not in catalog',
          'table in bathroom',
          'lounge composition in bathroom',
        ];

      default:
        return [];
    }
  }

  private buildMissingCategoryNegativePrompt(
    productCategories: Set<ProductCategory>,
    nonCommercialContext: readonly string[] = [],
  ) {
    const negative: string[] = [];
    const hasBuiltInCore = hasBuiltInNonCommercialCore(nonCommercialContext);

    if (!productCategories.has(ProductCategory.SOFA)) {
      negative.push('extra sofa', 'extra couch', 'unlisted sofa');
    }

    if (!productCategories.has(ProductCategory.BED)) {
      negative.push('extra bed', 'unlisted bed', 'mattress bedframe');
    }

    if (!productCategories.has(ProductCategory.SHELF) && !hasBuiltInCore) {
      negative.push(
        'extra shelf',
        'bookcase not in catalog',
        'storage rack not in catalog',
      );
    }

    if (!productCategories.has(ProductCategory.TV_STAND)) {
      negative.push('tv stand not in catalog', 'media cabinet not in catalog');
    }

    if (!productCategories.has(ProductCategory.WARDROBE) && !hasBuiltInCore) {
      negative.push('wardrobe not in catalog', 'large cabinet not in catalog');
    }

    if (!productCategories.has(ProductCategory.DRESSER) && !hasBuiltInCore) {
      negative.push('dresser not in catalog', 'sideboard not in catalog');
    }

    if (!productCategories.has(ProductCategory.DESK)) {
      negative.push('desk not in catalog', 'work table not in catalog');
    }

    if (!productCategories.has(ProductCategory.DECOR)) {
      negative.push('large commercial decor object', 'fake purchasable decor');
    }

    return negative;
  }

  private getProductCategories(products: Product[]) {
    return new Set(products.map((product) => product.category));
  }
}
