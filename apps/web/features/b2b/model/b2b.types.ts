import type {
  DesignVariant,
  GenerationJobStatus,
  InteriorStyle,
  Product,
  RoomType,
} from '@/shared/api/types';

export type B2BProjectStatus =
  | 'DRAFT'
  | 'READY_TO_GENERATE'
  | 'GENERATING'
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

export type B2BProject = {
  id: string;
  type: 'FURNITURE_LINE';
  status: B2BProjectStatus;
  name: string;
  partnerName: string;
  supplierId: string;
  supplier: B2BSupplier;
  roomType: RoomType;
  style: InteriorStyle;
  managerComment: string | null;
  roomProjectId: string | null;
  products: B2BProjectProduct[];
  roomProject: {
    generationJobs: B2BProjectGenerationJob[];
  } | null;
  createdAt: string;
  updatedAt: string;
  _count?: { products: number };
};

export type B2BProjectsListResponse = {
  items: B2BProject[];
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

export type CreateB2BProjectInput = {
  name: string;
  partnerName: string;
  supplierId: string;
  roomType: RoomType;
  style: InteriorStyle;
  managerComment?: string;
};

export type StartB2BGenerationResponse = {
  project: { id: string };
  job: { id: string; status: GenerationJobStatus };
};
