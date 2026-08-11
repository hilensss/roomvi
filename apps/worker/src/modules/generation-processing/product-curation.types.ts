import type {
  InteriorStyle,
  Product,
  ProductCategory,
  RoomType,
  GenerationScenario,
} from '@roomvi/database';
import type { SceneRole } from './product-semantic-classifier.js';

export type { SceneRole } from './product-semantic-classifier.js';

export type SceneDensity = 'AIRY' | 'BALANCED' | 'LAYERED';

export type NonCommercialContextItem =
  | 'BATHROOM_SANITARY_CORE'
  | 'KITCHEN_BUILT_IN_CORE'
  | 'LIVING_ROOM_TV';

export type WallSegmentProfile = {
  wallSegmentIndex: number;
  lengthCm: number;
  usableCm: number;
  hasWindow: boolean;
  hasDoor: boolean;
};

export type MediaWallCandidate = {
  wallSegmentIndex: number;
  usableCm: number;
};


export type SceneRenderNarrative = {
  roomStory: string;
  geometryRules: string[];
  cameraRule: string;
  focalRelationships: string[];
};

export type SceneZone = {
  name: string;
  purpose: string;
};

export type PlacementRule = {
  role: SceneRole;
  intent: string;
};

export type SceneBlueprint = {
  roomKey: string;
  variantIndex: number;
  designDirection: string;
  density: SceneDensity;
  zones: SceneZone[];
  requiredRoles: SceneRole[];
  optionalRoles: SceneRole[];
  placementRules: PlacementRule[];
  circulationRules: string[];
  nonCommercialContext?: NonCommercialContextItem[];
  renderNarrative?: SceneRenderNarrative;
};

export type SceneRoleAvailability = Partial<Record<SceneRole, number>>;

export type RoleCandidateGroup = {
  role: SceneRole;
  products: Product[];
};

export type SceneRoleAssignment = {
  role: SceneRole;
  productId: string;
};

export type ScenePlacementHint = {
  role: SceneRole;
  productId?: string;
  category?: ProductCategory;
  hint: string;
};

export type CuratedScenePlan = {
  roomKey: string;
  variantIndex: number;
  selectedProductIds: string[];
  roleAssignments: SceneRoleAssignment[];
  placementHints: ScenePlacementHint[];
};

export type RoomSizeClass = 'SMALL' | 'MEDIUM' | 'LARGE';

export type RoomSpatialProfile = {
  widthCm?: number;
  depthCm?: number;
  areaM2?: number;
  ceilingHeightCm?: number;
  aspectRatio?: number;
  polygonPoints?: number;
  windowPositions: string[];
  doorPositions: string[];
  longWallCm?: number;
  usableSolidWallCm?: number;
  wallSegments?: WallSegmentProfile[];
  mediaWallCandidate?: MediaWallCandidate;
  exactDoorCount?: number;
  exactWindowCount?: number;
  cameraWall?: number;
  geometryContract?: string[];
  geometryWarnings?: string[];
  circulationConstraints: string[];
  sizeClass: RoomSizeClass;
  source: 'REVIEWED_POLYGON' | 'DIMENSIONS' | 'LIMITED';
};

export type ProductScenePlan = SceneBlueprint & CuratedScenePlan;

export type CuratedProductPlan = {
  curationMode:
    | 'AI_CURATED'
    | 'AI_CURATED_REPAIRED'
    | 'DETERMINISTIC'
    | 'DETERMINISTIC_ONLY'
    | 'DETERMINISTIC_FALLBACK';
  fallbackReason?: string;
  curatorModel?: string;
  curationDurationMs?: number;
  scenePlan: ProductScenePlan;
  spatialProfile: RoomSpatialProfile;
  products: Product[];
  totalPrice: number;
  missingRequiredCategories: ProductCategory[];
};

export type ProductSelectionMode =
  | 'AI_CURATED'
  | 'AI_CURATED_REPAIRED'
  | 'MIXED'
  | 'DETERMINISTIC_ONLY'
  | 'DETERMINISTIC_FALLBACK'
  | 'MANUAL';

export type ProductSelectionMetadata = {
  mode: ProductSelectionMode;
  scenario: string;
  requestedPlanCount: number;
  aiPlanCount: number;
  deterministicPlanCount: number;
  repairedPlanCount: number;
  fallbackReason?: string;
  model?: string;
  durationMs?: number;
};

export type ProductCurationRoomInput = {
  scenario?: GenerationScenario;
  roomKey: string;
  roomType: RoomType;
  style: InteriorStyle;
  budgetMin?: number;
  budgetMax?: number;
  supplierId?: string;
  widthCm?: number;
  depthCm?: number;
  areaM2?: number;
  ceilingHeightCm?: number;
  polygon?: unknown;
  hasSourceImage?: boolean;
  b2bProjectContext?: {
    projectName: string;
    developerName: string;
  };
  openings?: Array<{
    kind: string;
    wallSegmentIndex: number;
    positionRatio: number;
    widthCm: number | null;
  }>;
};
