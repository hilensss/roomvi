export type RoomType =
  | 'LIVING_ROOM'
  | 'BEDROOM'
  | 'KITCHEN'
  | 'KIDS_ROOM'
  | 'OFFICE'
  | 'HALLWAY'
  | 'BATHROOM'
  | 'STUDIO';

export type InteriorStyle =
  | 'MODERN'
  | 'MINIMALISM'
  | 'SCANDI'
  | 'LOFT'
  | 'CLASSIC'
  | 'NEOCLASSIC'
  | 'JAPANDI'
  | 'PROVENCE'
  | 'ECO'
  | 'HIGH_TECH';

export type ProductCategory =
  | 'SOFA'
  | 'ARMCHAIR'
  | 'CHAIR'
  | 'TABLE'
  | 'COFFEE_TABLE'
  | 'BED'
  | 'WARDROBE'
  | 'LIGHTING'
  | 'RUG'
  | 'DECOR';

export type GenerationJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELED';

export type StockStatus = 'IN_STOCK' | 'OUT_OF_STOCK' | 'PREORDER' | 'UNKNOWN';

export type CartItemSource = 'CATALOG' | 'DESIGN_PROJECT';

export type GuestSessionResponse = {
  isGuest: true;
  anonymousId: string;
  previewGenerationsUsed: number;
  previewGenerationsLimit: number;
  canGeneratePreview: boolean;
  expiresAt: string;
};

export type UploadedFile = {
  id: string;
  ownerType: 'USER' | 'GUEST';
  userId: string | null;
  guestSessionId: string | null;
  originalName: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url: string;
  purpose: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Product = {
  id: string;
  supplierId: string;
  externalId: string;
  title: string;
  description: string | null;
  category: string;
  roomTypes: RoomType[];
  styleTags: InteriorStyle[];
  price: number;
  oldPrice: number | null;
  currency: string;
  stockStatus: StockStatus;
  imageUrls: string[];
  productUrl: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  material: string | null;
  color: string | null;
  isActive: boolean;
  isAiEligible: boolean;
  supplier?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
};

export type RoomProject = {
  id: string;
  title: string | null;
  roomType: RoomType;
  style: InteriorStyle;
  budgetMin: number | null;
  budgetMax: number | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  sourceImageUrl: string | null;
  status: string;
  selectedDesignVariantId: string | null;
  createdAt: string;
  updatedAt: string;
  latestGenerationJobId: string;

  designVariants?: DesignVariant;
};

export type DesignVariantProduct = {
  id: string;
  designVariantId: string;
  productId: string;
  role: string | null;
  x: number | null;
  y: number | null;
  productSnapshot: unknown;
  product: Product;
};

export type DesignVariant = {
  id: string;
  roomProjectId: string;
  generationJobId: string;
  title: string | null;
  description: string | null;
  imageUrl: string;
  totalPrice: number | null;
  currency: string;
  isSelected: boolean;
  products: DesignVariantProduct[];
  createdAt: string;
  updatedAt: string;
};

export type GenerationJob = {
  id: string;
  status: GenerationJobStatus;
  provider: string;
  prompt: string | null;
  negativePrompt: string | null;
  progress: number;
  currentStep: string;
  errorMessage: string | null;
  roomProject: RoomProject;
  designVariants: DesignVariant[];
  createdAt: string;
  updatedAt: string;
};

export type CartItem = {
  id: string;
  cartId: string;
  productId: string;
  supplierId: string;
  source: CartItemSource;
  roomProjectId: string | null;
  designVariantId: string | null;
  quantity: number;
  priceSnapshot: number;
  titleSnapshot: string;
  imageSnapshot: string | null;
  availabilitySnapshot: StockStatus;
  product: Product;
  roomProject?: Pick<
    RoomProject,
    'id' | 'title' | 'roomType' | 'style' | 'status'
  > | null;
  designVariant?: Pick<
    DesignVariant,
    'id' | 'title' | 'imageUrl' | 'totalPrice'
  > | null;
};

export type Cart = {
  id: string;
  userId: string | null;
  guestSessionId: string | null;
  status: string;
  totalAmount: number;
  currency: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
};

export type CurrentCartResponse =
  | Cart
  | {
      cart: null;
      items: [];
      totalAmount: 0;
      currency: 'RUB';
    };

export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
};

export type ProductsListResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

export type OrderStatus =
  | 'DRAFT'
  | 'CREATED'
  | 'PAID'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

export type Order = {
  id: string;
  number?: string | null;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  roomProject?: {
    id: string;
    title: string;
  } | null;
  items?: {
    id: string;
    quantity: number;
  }[];
};
