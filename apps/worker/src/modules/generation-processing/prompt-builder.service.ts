import { Injectable } from '@nestjs/common';
import {
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
} from '@roomvi/database';

type PromptInput = {
  roomType: RoomType;
  style: InteriorStyle;
  title?: string;
  budgetMin?: number;
  budgetMax?: number;
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  sourceImageUrl?: string;
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
  OTHER: 'other catalog item',
};

const COMPACT_DESCRIPTION_MAX_LENGTH = 120;

const ROOM_HERO_CATEGORY: Partial<Record<RoomType, ProductCategory>> = {
  LIVING_ROOM: ProductCategory.SOFA,
  BEDROOM: ProductCategory.BED,
  OFFICE: ProductCategory.DESK,
  KITCHEN: ProductCategory.TABLE,
  KIDS_ROOM: ProductCategory.BED,
  HALLWAY: ProductCategory.WARDROBE,
  STUDIO: ProductCategory.SOFA,
};

const ROOM_COMPACT_CATEGORY_PRIORITY: Partial<
  Record<RoomType, ProductCategory[]>
> = {
  LIVING_ROOM: [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.TV_STAND,
    ProductCategory.RUG,
    ProductCategory.SHELF,
    ProductCategory.LAMP,
    ProductCategory.ARMCHAIR,
    ProductCategory.DRESSER,
    ProductCategory.DECOR,
  ],
  STUDIO: [
    ProductCategory.SOFA,
    ProductCategory.COFFEE_TABLE,
    ProductCategory.TV_STAND,
    ProductCategory.RUG,
    ProductCategory.SHELF,
    ProductCategory.LAMP,
    ProductCategory.ARMCHAIR,
    ProductCategory.DESK,
    ProductCategory.DECOR,
  ],
  BEDROOM: [
    ProductCategory.BED,
    ProductCategory.WARDROBE,
    ProductCategory.DRESSER,
    ProductCategory.LAMP,
    ProductCategory.RUG,
    ProductCategory.DECOR,
    ProductCategory.ARMCHAIR,
    ProductCategory.SHELF,
    ProductCategory.DESK,
  ],
  KITCHEN: [
    ProductCategory.TABLE,
    ProductCategory.CHAIR,
    ProductCategory.LAMP,
    ProductCategory.SHELF,
    ProductCategory.DECOR,
  ],
  OFFICE: [
    ProductCategory.DESK,
    ProductCategory.CHAIR,
    ProductCategory.LAMP,
    ProductCategory.SHELF,
    ProductCategory.RUG,
    ProductCategory.DECOR,
  ],
  KIDS_ROOM: [
    ProductCategory.BED,
    ProductCategory.DESK,
    ProductCategory.CHAIR,
    ProductCategory.WARDROBE,
    ProductCategory.LAMP,
    ProductCategory.RUG,
    ProductCategory.SHELF,
    ProductCategory.DECOR,
  ],
  HALLWAY: [
    ProductCategory.WARDROBE,
    ProductCategory.DRESSER,
    ProductCategory.SHELF,
    ProductCategory.LAMP,
    ProductCategory.DECOR,
  ],
};

const FALLBACK_COMPACT_CATEGORY_PRIORITY = [
  ProductCategory.SOFA,
  ProductCategory.BED,
  ProductCategory.TABLE,
  ProductCategory.DESK,
  ProductCategory.COFFEE_TABLE,
  ProductCategory.TV_STAND,
  ProductCategory.WARDROBE,
  ProductCategory.DRESSER,
  ProductCategory.SHELF,
  ProductCategory.CHAIR,
  ProductCategory.ARMCHAIR,
  ProductCategory.RUG,
  ProductCategory.LAMP,
  ProductCategory.DECOR,
  ProductCategory.MATTRESS,
  ProductCategory.OTHER,
];

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
      '',
      'STYLE DIRECTION:',
      ...styleInstructions,
      '',
      'ROOM-SPECIFIC DESIGN RULES:',
      ...roomInstructions,
      '',
      'SELECTED CATALOG PRODUCTS:',
      productLines ||
        'No catalog products were provided. Keep the room minimal and do not invent major furniture.',
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
      'The image must look like a premium real-estate / interior design photo, not a collage and not a product catalog grid.',
      'Use soft natural light, realistic shadows, correct scale, coherent materials, clean styling and tasteful spacing.',
      'The design may be minimal if the selected catalog set is small; empty space is better than inventing unlisted furniture.',
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
    const fullPrompt = this.buildPrompt(dto, products);

    if (fullPrompt.length <= maxLength) {
      return {
        prompt: fullPrompt,
        mode: 'full',
        includedProductsCount: products.length,
        totalProductsCount: products.length,
      };
    }

    const compactPrompt = this.buildCompactPrompt(dto, products, products);

    if (compactPrompt.length <= maxLength) {
      return {
        prompt: compactPrompt,
        mode: 'compact',
        includedProductsCount: products.length,
        totalProductsCount: products.length,
      };
    }

    const prioritizedProducts = this.sortProductsByVisualPriority(
      dto.roomType,
      products,
    );
    const heroProduct = this.getHeroProduct(dto.roomType, products);
    let includedProducts: Product[] = [];
    let limitedPrompt = this.buildCompactPrompt(dto, products, includedProducts);

    if (limitedPrompt.length > maxLength) {
      throw new Error(
        `YES AI prompt cannot be reduced below ${maxLength} characters`,
      );
    }

    for (const product of prioritizedProducts) {
      const candidateProducts = [...includedProducts, product];
      const candidatePrompt = this.buildCompactPrompt(
        dto,
        products,
        candidateProducts,
      );

      if (candidatePrompt.length > maxLength) {
        if (heroProduct && product === heroProduct) {
          throw new Error(
            `YES AI prompt cannot be reduced below ${maxLength} characters`,
          );
        }

        break;
      }

      includedProducts = candidateProducts;
      limitedPrompt = candidatePrompt;
    }

    return {
      prompt: limitedPrompt,
      mode: 'compact',
      includedProductsCount: includedProducts.length,
      totalProductsCount: products.length,
    };
  }

  buildNegativePrompt(dto?: PromptInput, products: Product[] = []) {
    const productCategories = this.getProductCategories(products);

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
      'extra furniture',
      'unlisted furniture',
      'furniture not in catalog',
      'random decor',
      'plants not in catalog',
      'vases not in catalog',
      'paintings not in catalog',
      'wall art not in catalog',
      'extra doors',
      'broken windows',
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
      ...this.buildMissingCategoryNegativePrompt(productCategories),
    ].join(', ');
  }

  private buildCompactPrompt(
    dto: PromptInput,
    allProducts: Product[],
    includedProducts: Product[],
  ) {
    const productCategories = this.getProductCategories(includedProducts);
    const productLines = this.buildCompactProductLines(includedProducts);
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
      '',
      'STYLE DIRECTION:',
      ...styleInstructions,
      '',
      'ROOM-SPECIFIC DESIGN RULES:',
      ...roomInstructions,
      '',
      'SELECTED CATALOG PRODUCTS:',
      productLines ||
        'No catalog products were provided. Keep the room minimal and do not invent major furniture.',
      '',
      'COMPACT CATALOG VISUAL RULES:',
      'Preserve category, approximate silhouette, color, material and scale for every listed product.',
      'Do not replace any listed product with another category.',
      'Do not invent extra products beyond the compact catalog list.',
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
      'The image must look like a premium real-estate / interior design photo, not a collage and not a product catalog grid.',
      'Use soft natural light, realistic shadows, correct scale, coherent materials, clean styling and tasteful spacing.',
      'The design may be minimal if the selected catalog set is small; empty space is better than inventing unlisted furniture.',
      'Do not place product labels, text annotations, arrows, prices, brand labels or measurement text in the image.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private buildProductLines(products: Product[]) {
    return products
      .slice(0, 12)
      .map((product, index) => {
        const categoryLabel = PRODUCT_CATEGORY_LABELS[product.category];

        return [
          `${index + 1}. ID=${product.id}`,
          `CATEGORY=${product.category} (${categoryLabel})`,
          `TITLE=${product.title}`,
          product.description ? `DESCRIPTION=${product.description}` : null,
          product.color && product.color !== 'Не указан'
            ? `COLOR=${product.color}`
            : null,
          product.material ? `MATERIAL=${product.material}` : null,
          product.widthCm && product.depthCm && product.heightCm
            ? `SIZE=${product.widthCm}x${product.depthCm}x${product.heightCm} cm`
            : null,
          `PRICE=${product.price} RUB`,
          product.styleTags.length
            ? `CATALOG_STYLES=${product.styleTags.join(', ')}`
            : null,
          product.roomTypes.length
            ? `CATALOG_ROOMS=${product.roomTypes.join(', ')}`
            : null,
          'VISUAL_RULE=Use this exact product category and role. Preserve its approximate silhouette, color, material and scale. Do not reinterpret it as another furniture category.',
        ]
          .filter(Boolean)
          .join('; ');
      })
      .join('\n');
  }

  private buildCompactProductLines(products: Product[]) {
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
          `${index + 1}. CATEGORY=${product.category} (${categoryLabel})`,
          `TITLE=${product.title}`,
          product.color && product.color !== 'Не указан'
            ? `COLOR=${product.color}`
            : null,
          product.material ? `MATERIAL=${product.material}` : null,
          product.widthCm && product.depthCm && product.heightCm
            ? `SIZE=${product.widthCm}x${product.depthCm}x${product.heightCm} cm`
            : null,
          compactDescription ? `DESCRIPTION=${compactDescription}` : null,
          `VISUAL_RULE=Use as listed ${product.category} role.`,
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

  private sortProductsByVisualPriority(
    roomType: RoomType,
    products: Product[],
  ) {
    const heroProduct = this.getHeroProduct(roomType, products);
    const originalIndexById = new Map(
      products.map((product, index) => [product.id, index]),
    );
    const categoryPriority =
      ROOM_COMPACT_CATEGORY_PRIORITY[roomType] ??
      FALLBACK_COMPACT_CATEGORY_PRIORITY;

    return [...products].sort((left, right) => {
      if (left === heroProduct) return -1;
      if (right === heroProduct) return 1;

      const leftPriority = this.getCategoryPriority(
        categoryPriority,
        left.category,
      );
      const rightPriority = this.getCategoryPriority(
        categoryPriority,
        right.category,
      );

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return (
        (originalIndexById.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (originalIndexById.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }

  private getHeroProduct(roomType: RoomType, products: Product[]) {
    const heroCategory = ROOM_HERO_CATEGORY[roomType];

    if (!heroCategory) return undefined;

    return products.find((product) => product.category === heroCategory);
  }

  private getCategoryPriority(
    categoryPriority: ProductCategory[],
    category: ProductCategory,
  ) {
    const index = categoryPriority.indexOf(category);

    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  }

  private buildCatalogRules(
    dto: PromptInput,
    products: Product[],
    productCategories: Set<ProductCategory>,
  ) {
    const rules = [
      'Use ONLY the selected catalog products as visible furniture/decor items.',
      'Every major visible object must correspond to one of the selected catalog products.',
      'Do not invent additional sofas, beds, chairs, tables, cabinets, shelves, rugs, lamps, plants, vases, paintings or decor.',
      'Do not change a product category into another category. A BED must look like a bed, not a sofa. A SOFA must look like a sofa, not a bed. A DESK must look like a desk, not a dining table.',
      'If the selected product set is small, create a clean sparse design and leave empty space instead of adding unlisted furniture.',
      'Reference product images may be attached. Treat them as visual guidance for silhouette, color, material and category, but the catalog list is the source of truth.',
    ];

    if (products.length <= 4) {
      rules.push(
        'The selected catalog set is intentionally small. Create a minimal interior with only these products. Do not complete the room with invented furniture.',
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
          'Use a comfortable social layout with realistic walking space and natural viewing angles.',
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
          'This must look unmistakably like a kitchen or dining area.',
          productCategories.has(ProductCategory.TABLE)
            ? 'The selected TABLE is the main object of the dining/kitchen composition.'
            : 'If no TABLE product is selected, do not invent a dining table.',
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

      case RoomType.HALLWAY:
        return [
          'This must look like a hallway or entryway, not a bedroom or living room.',
          'Focus on storage, circulation space and practical entry-zone styling.',
          'Do not add beds, sofas, coffee tables or lounge furniture.',
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
        'Use the selected LAMP as the main visible lighting fixture or accent lamp.',
      );
    }

    if (productCategories.has(ProductCategory.ARMCHAIR)) {
      rules.push(
        'Place the selected ARMCHAIR as a secondary seating accent, not as the main object unless no sofa/bed is selected.',
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
      'No LAMP product is selected: do not add extra lamps, chandeliers or pendant lights as visible products.',
    );
    forbidIfMissing(
      ProductCategory.DECOR,
      'No DECOR product is selected: do not add plants, vases, paintings, pillows, sculptures or random decor.',
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
        ];

      default:
        return [];
    }
  }

  private buildMissingCategoryNegativePrompt(
    productCategories: Set<ProductCategory>,
  ) {
    const negative: string[] = [];

    if (!productCategories.has(ProductCategory.SOFA)) {
      negative.push('extra sofa', 'extra couch', 'unlisted sofa');
    }

    if (!productCategories.has(ProductCategory.BED)) {
      negative.push('extra bed', 'unlisted bed', 'mattress bedframe');
    }

    if (!productCategories.has(ProductCategory.SHELF)) {
      negative.push(
        'extra shelf',
        'bookcase not in catalog',
        'storage rack not in catalog',
      );
    }

    if (!productCategories.has(ProductCategory.TV_STAND)) {
      negative.push('tv stand not in catalog', 'media cabinet not in catalog');
    }

    if (!productCategories.has(ProductCategory.WARDROBE)) {
      negative.push('wardrobe not in catalog', 'large cabinet not in catalog');
    }

    if (!productCategories.has(ProductCategory.DRESSER)) {
      negative.push('dresser not in catalog', 'sideboard not in catalog');
    }

    if (!productCategories.has(ProductCategory.DESK)) {
      negative.push('desk not in catalog', 'work table not in catalog');
    }

    if (!productCategories.has(ProductCategory.DECOR)) {
      negative.push('decor not in catalog', 'plants', 'vases', 'paintings');
    }

    return negative;
  }

  private getProductCategories(products: Product[]) {
    return new Set(products.map((product) => product.category));
  }
}
