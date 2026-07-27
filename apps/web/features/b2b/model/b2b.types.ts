import type {
  DesignVariant,
  GenerationJobStatus,
  InteriorStyle,
  Product,
  RoomType,
} from '@/shared/api/types';

export type B2BProjectStatus =
  | 'DRAFT'
  | 'ANALYZING'
  | 'REVIEW_REQUIRED'
  | 'READY_TO_GENERATE'
  | 'GENERATING'
  | 'PARTIALLY_COMPLETED'
  | 'COMPLETED'
  | 'FAILED';

export type B2BSupplier = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type B2BProjectProduct = {
  id: string;
  productId: string;
  sortOrder: number;
  productSnapshot: unknown;
  product: Product;
};

export type B2BProjectGenerationJob = {
  id: string;
  status: GenerationJobStatus;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  designVariants: DesignVariant[];
};

export type B2BAnalysisRun = {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  provider: string | null;
  model: string | null;
  progress: number;
  currentStep: string | null;
  errorMessage: string | null;
  warnings: string[] | null;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: string;
  updatedAt: string;
};

export type B2BRoomPoint = { x: number; y: number };

export type B2BRoomOpening = {
  id: string;
  kind: 'WINDOW' | 'DOOR';
  wallSegmentIndex: number;
  positionRatio: number;
  widthCm: number | null;
  recognitionConfidence: number | null;
};

export type B2BRoom = {
  id: string;
  status:
    | 'DETECTED'
    | 'REVIEW_REQUIRED'
    | 'READY_TO_GENERATE'
    | 'GENERATING'
    | 'GENERATED'
    | 'FAILED'
    | 'SKIPPED';
  sourceLabel: string | null;
  name: string;
  roomType: RoomType | null;
  styleOverride: InteriorStyle | null;
  widthCm: number | null;
  depthCm: number | null;
  areaM2: number | null;
  ceilingHeightCm: number | null;
  polygon: B2BRoomPoint[];
  recognitionConfidence: number | null;
  recognitionNotes: string | null;
  sortOrder: number;
  isIncluded: boolean;
  openings: B2BRoomOpening[];
};

type B2BProjectBase = {
  id: string;
  status: B2BProjectStatus;
  name: string;
  partnerName: string;
  style: InteriorStyle;
  managerComment: string | null;
  sourceImageUrl: string | null;
  roomProjectId: string | null;
  products: B2BProjectProduct[];
  roomProject: {
    generationJobs: B2BProjectGenerationJob[];
  } | null;
  defaultCeilingHeightCm: number;
  roomsRevision: number;
  rooms: B2BRoom[];
  analysisRuns: B2BAnalysisRun[];
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
};

export type FurnitureB2BProject = B2BProjectBase & {
  type: 'FURNITURE_LINE';
  supplierId: string;
  supplier: B2BSupplier;
  roomType: RoomType;
};

export type DeveloperB2BProject = B2BProjectBase & {
  type: 'DEVELOPER_FLOOR_PLAN';
  supplierId: null;
  supplier: null;
  roomType: null;
};

export type B2BProject = FurnitureB2BProject | DeveloperB2BProject;

export type B2BProjectListItem = Omit<
  B2BProjectBase,
  'products' | 'roomProject' | 'rooms' | 'analysisRuns' | '_count'
> & {
  type: 'FURNITURE_LINE' | 'DEVELOPER_FLOOR_PLAN';
  supplierId: string | null;
  supplier: B2BSupplier | null;
  roomType: RoomType | null;
  _count: { products: number };
  roomProject: {
    generationJobs: Pick<
      B2BProjectGenerationJob,
      'id' | 'status' | 'progress'
    >[];
  } | null;
};

export type B2BProjectsListResponse = {
  items: B2BProjectListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type B2BProjectCatalogResponse = {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
};

export type CreateB2BProjectInput =
  | {
      type?: 'FURNITURE_LINE';
      name: string;
      partnerName: string;
      supplierId: string;
      roomType: RoomType;
      style: InteriorStyle;
      managerComment?: string;
      sourceImageUrl?: string;
    }
  | {
      type: 'DEVELOPER_FLOOR_PLAN';
      name: string;
      partnerName: string;
      style: InteriorStyle;
      managerComment?: string;
      sourceImageUrl: string;
      defaultCeilingHeightCm: number;
    };

export type ReplaceB2BRoomsInput = {
  projectId: string;
  roomsRevision: number;
  rooms: Array<
    Omit<
      Pick<
        B2BRoom,
        | 'id'
        | 'sourceLabel'
        | 'name'
        | 'roomType'
        | 'styleOverride'
        | 'widthCm'
        | 'depthCm'
        | 'areaM2'
        | 'ceilingHeightCm'
        | 'polygon'
        | 'recognitionConfidence'
        | 'recognitionNotes'
        | 'isIncluded'
        | 'openings'
      >,
      'openings'
    > & {
      openings: Array<Omit<B2BRoomOpening, 'id'> & { id?: string }>;
    }
  >;
};

export type StartB2BGenerationResponse = {
  project: { id: string };
  job: { id: string; status: GenerationJobStatus };
};
