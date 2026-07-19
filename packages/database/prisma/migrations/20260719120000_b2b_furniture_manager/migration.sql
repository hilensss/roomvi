-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'MANAGER' AFTER 'USER';

-- CreateEnum
CREATE TYPE "GenerationScenario" AS ENUM ('MARKETPLACE', 'B2B_FURNITURE_LINE');

-- CreateEnum
CREATE TYPE "B2BProjectType" AS ENUM ('FURNITURE_LINE');

-- CreateEnum
CREATE TYPE "B2BProjectStatus" AS ENUM ('DRAFT', 'READY_TO_GENERATE', 'GENERATING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "GenerationJob"
ADD COLUMN "scenario" "GenerationScenario" NOT NULL DEFAULT 'MARKETPLACE',
ADD COLUMN "requestedVariants" INTEGER;

-- CreateTable
CREATE TABLE "B2BProject" (
    "id" TEXT NOT NULL,
    "type" "B2BProjectType" NOT NULL DEFAULT 'FURNITURE_LINE',
    "status" "B2BProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "partnerName" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL,
    "style" "InteriorStyle" NOT NULL,
    "managerComment" TEXT,
    "createdById" TEXT NOT NULL,
    "roomProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "B2BProjectProduct" (
    "id" TEXT NOT NULL,
    "b2bProjectId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BProjectProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "B2BProject_roomProjectId_key" ON "B2BProject"("roomProjectId");

-- CreateIndex
CREATE INDEX "B2BProject_status_idx" ON "B2BProject"("status");

-- CreateIndex
CREATE INDEX "B2BProject_supplierId_idx" ON "B2BProject"("supplierId");

-- CreateIndex
CREATE INDEX "B2BProject_createdById_idx" ON "B2BProject"("createdById");

-- CreateIndex
CREATE INDEX "B2BProject_createdAt_idx" ON "B2BProject"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "B2BProjectProduct_b2bProjectId_productId_key" ON "B2BProjectProduct"("b2bProjectId", "productId");

-- CreateIndex
CREATE INDEX "B2BProjectProduct_b2bProjectId_sortOrder_idx" ON "B2BProjectProduct"("b2bProjectId", "sortOrder");

-- CreateIndex
CREATE INDEX "B2BProjectProduct_productId_idx" ON "B2BProjectProduct"("productId");

-- CreateIndex
CREATE INDEX "GenerationJob_scenario_idx" ON "GenerationJob"("scenario");

-- AddForeignKey
ALTER TABLE "B2BProject" ADD CONSTRAINT "B2BProject_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BProject" ADD CONSTRAINT "B2BProject_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BProject" ADD CONSTRAINT "B2BProject_roomProjectId_fkey" FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BProjectProduct" ADD CONSTRAINT "B2BProjectProduct_b2bProjectId_fkey" FOREIGN KEY ("b2bProjectId") REFERENCES "B2BProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "B2BProjectProduct" ADD CONSTRAINT "B2BProjectProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
