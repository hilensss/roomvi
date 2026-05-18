-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SupplierProductRawStatus" AS ENUM ('ACTIVE', 'OUT_OF_STOCK', 'REMOVED', 'ERROR');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK', 'PREORDER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('SOFA', 'BED', 'ARMCHAIR', 'CHAIR', 'TABLE', 'COFFEE_TABLE', 'TV_STAND', 'WARDROBE', 'DRESSER', 'SHELF', 'DESK', 'LAMP', 'RUG', 'DECOR', 'MATTRESS', 'OTHER');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('LIVING_ROOM', 'BEDROOM', 'KITCHEN', 'KIDS_ROOM', 'OFFICE', 'HALLWAY', 'BATHROOM', 'STUDIO');

-- CreateEnum
CREATE TYPE "InteriorStyle" AS ENUM ('MODERN', 'MINIMALISM', 'SCANDI', 'LOFT', 'CLASSIC', 'NEOCLASSIC', 'JAPANDI', 'PROVENCE', 'ECO', 'HIGH_TECH');

-- CreateEnum
CREATE TYPE "RoomProjectStatus" AS ENUM ('DRAFT', 'READY_TO_GENERATE', 'GENERATING', 'GENERATED', 'SELECTED', 'ORDER_CREATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GenerationOwnerType" AS ENUM ('USER', 'GUEST');

-- CreateEnum
CREATE TYPE "GenerationProvider" AS ENUM ('MOCK', 'MIDJOURNEY', 'STABLE_DIFFUSION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestSession" (
    "id" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgentHash" TEXT,
    "previewGenerationsUsed" INTEGER NOT NULL DEFAULT 0,
    "previewGenerationsLimit" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "convertedUserId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "websiteUrl" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierProductRaw" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "rawPayload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "SupplierProductRawStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierProductRaw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "rawProductId" TEXT,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ProductCategory" NOT NULL,
    "roomTypes" "RoomType"[],
    "styleTags" "InteriorStyle"[],
    "price" INTEGER NOT NULL,
    "oldPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "stockStatus" "StockStatus" NOT NULL DEFAULT 'UNKNOWN',
    "imageUrls" TEXT[],
    "productUrl" TEXT,
    "widthCm" INTEGER,
    "heightCm" INTEGER,
    "depthCm" INTEGER,
    "material" TEXT,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAiEligible" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomProject" (
    "id" TEXT NOT NULL,
    "ownerType" "GenerationOwnerType" NOT NULL,
    "userId" TEXT,
    "guestSessionId" TEXT,
    "title" TEXT,
    "roomType" "RoomType" NOT NULL,
    "style" "InteriorStyle" NOT NULL,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "widthCm" INTEGER,
    "heightCm" INTEGER,
    "depthCm" INTEGER,
    "sourceImageUrl" TEXT,
    "status" "RoomProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "selectedDesignVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "ownerType" "GenerationOwnerType" NOT NULL,
    "userId" TEXT,
    "guestSessionId" TEXT,
    "roomProjectId" TEXT NOT NULL,
    "provider" "GenerationProvider" NOT NULL DEFAULT 'MOCK',
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT,
    "negativePrompt" TEXT,
    "inputParams" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignVariant" (
    "id" TEXT NOT NULL,
    "roomProjectId" TEXT NOT NULL,
    "generationJobId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "totalPrice" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "isSelected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignVariantProduct" (
    "id" TEXT NOT NULL,
    "designVariantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "role" TEXT,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "productSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignVariantProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_jti_key" ON "RefreshToken"("jti");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_jti_idx" ON "RefreshToken"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "GuestSession_anonymousId_key" ON "GuestSession"("anonymousId");

-- CreateIndex
CREATE INDEX "GuestSession_expiresAt_idx" ON "GuestSession"("expiresAt");

-- CreateIndex
CREATE INDEX "GuestSession_convertedUserId_idx" ON "GuestSession"("convertedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_slug_key" ON "Supplier"("slug");

-- CreateIndex
CREATE INDEX "SupplierProductRaw_supplierId_idx" ON "SupplierProductRaw"("supplierId");

-- CreateIndex
CREATE INDEX "SupplierProductRaw_externalId_idx" ON "SupplierProductRaw"("externalId");

-- CreateIndex
CREATE INDEX "SupplierProductRaw_payloadHash_idx" ON "SupplierProductRaw"("payloadHash");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierProductRaw_supplierId_externalId_key" ON "SupplierProductRaw"("supplierId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_rawProductId_key" ON "Product"("rawProductId");

-- CreateIndex
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "Product_stockStatus_idx" ON "Product"("stockStatus");

-- CreateIndex
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");

-- CreateIndex
CREATE INDEX "Product_isAiEligible_idx" ON "Product"("isAiEligible");

-- CreateIndex
CREATE INDEX "Product_price_idx" ON "Product"("price");

-- CreateIndex
CREATE UNIQUE INDEX "Product_supplierId_externalId_key" ON "Product"("supplierId", "externalId");

-- CreateIndex
CREATE INDEX "RoomProject_userId_idx" ON "RoomProject"("userId");

-- CreateIndex
CREATE INDEX "RoomProject_guestSessionId_idx" ON "RoomProject"("guestSessionId");

-- CreateIndex
CREATE INDEX "RoomProject_roomType_idx" ON "RoomProject"("roomType");

-- CreateIndex
CREATE INDEX "RoomProject_style_idx" ON "RoomProject"("style");

-- CreateIndex
CREATE INDEX "RoomProject_status_idx" ON "RoomProject"("status");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_idx" ON "GenerationJob"("userId");

-- CreateIndex
CREATE INDEX "GenerationJob_guestSessionId_idx" ON "GenerationJob"("guestSessionId");

-- CreateIndex
CREATE INDEX "GenerationJob_roomProjectId_idx" ON "GenerationJob"("roomProjectId");

-- CreateIndex
CREATE INDEX "GenerationJob_status_idx" ON "GenerationJob"("status");

-- CreateIndex
CREATE INDEX "GenerationJob_provider_idx" ON "GenerationJob"("provider");

-- CreateIndex
CREATE INDEX "DesignVariant_roomProjectId_idx" ON "DesignVariant"("roomProjectId");

-- CreateIndex
CREATE INDEX "DesignVariant_generationJobId_idx" ON "DesignVariant"("generationJobId");

-- CreateIndex
CREATE INDEX "DesignVariant_isSelected_idx" ON "DesignVariant"("isSelected");

-- CreateIndex
CREATE INDEX "DesignVariantProduct_designVariantId_idx" ON "DesignVariantProduct"("designVariantId");

-- CreateIndex
CREATE INDEX "DesignVariantProduct_productId_idx" ON "DesignVariantProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "DesignVariantProduct_designVariantId_productId_key" ON "DesignVariantProduct"("designVariantId", "productId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuestSession" ADD CONSTRAINT "GuestSession_convertedUserId_fkey" FOREIGN KEY ("convertedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductRaw" ADD CONSTRAINT "SupplierProductRaw_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_rawProductId_fkey" FOREIGN KEY ("rawProductId") REFERENCES "SupplierProductRaw"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomProject" ADD CONSTRAINT "RoomProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomProject" ADD CONSTRAINT "RoomProject_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_guestSessionId_fkey" FOREIGN KEY ("guestSessionId") REFERENCES "GuestSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_roomProjectId_fkey" FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVariant" ADD CONSTRAINT "DesignVariant_roomProjectId_fkey" FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVariant" ADD CONSTRAINT "DesignVariant_generationJobId_fkey" FOREIGN KEY ("generationJobId") REFERENCES "GenerationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVariantProduct" ADD CONSTRAINT "DesignVariantProduct_designVariantId_fkey" FOREIGN KEY ("designVariantId") REFERENCES "DesignVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVariantProduct" ADD CONSTRAINT "DesignVariantProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
