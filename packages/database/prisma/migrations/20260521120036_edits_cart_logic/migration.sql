/*
  Warnings:

  - You are about to drop the column `designVariantId` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `roomProjectId` on the `Cart` table. All the data in the column will be lost.
  - You are about to drop the column `roomProjectId` on the `Order` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "CartItemSource" AS ENUM ('CATALOG', 'DESIGN_PROJECT');

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_designVariantId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_roomProjectId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_roomProjectId_fkey";

-- DropIndex
DROP INDEX "Cart_designVariantId_key";

-- DropIndex
DROP INDEX "Cart_roomProjectId_key";

-- DropIndex
DROP INDEX "Order_roomProjectId_idx";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "designVariantId",
DROP COLUMN "roomProjectId";

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "designVariantId" TEXT,
ADD COLUMN     "roomProjectId" TEXT;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "roomProjectId";

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "designVariantId" TEXT,
ADD COLUMN     "roomProjectId" TEXT,
ADD COLUMN     "source" "CartItemSource" NOT NULL DEFAULT 'CATALOG';

-- CreateIndex
CREATE INDEX "OrderItem_source_idx" ON "OrderItem"("source");

-- CreateIndex
CREATE INDEX "OrderItem_roomProjectId_idx" ON "OrderItem"("roomProjectId");

-- CreateIndex
CREATE INDEX "OrderItem_designVariantId_idx" ON "OrderItem"("designVariantId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_roomProjectId_fkey" FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_designVariantId_fkey" FOREIGN KEY ("designVariantId") REFERENCES "DesignVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
