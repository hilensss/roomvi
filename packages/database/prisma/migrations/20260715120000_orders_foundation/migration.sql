-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MANUAL', 'ALFABANK');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('NOT_STARTED', 'PROCUREMENT', 'PARTIALLY_PROCURED', 'PROCURED', 'SHIPPED', 'DELIVERED');

-- CreateEnum
CREATE TYPE "OrderItemProcurementStatus" AS ENUM ('NOT_STARTED', 'ORDERED', 'CONFIRMED_BY_SUPPLIER', 'UNAVAILABLE', 'REPLACEMENT_REQUIRED', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED' AFTER 'FAILED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED' AFTER 'REFUNDED';

-- ReplaceEnum
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order"
ALTER COLUMN "status" TYPE "OrderStatus_new"
USING (
  CASE
    WHEN "status"::text = 'CREATED' AND "paymentStatus" = 'NOT_REQUIRED'::"PaymentStatus" THEN 'CONFIRMED'
    WHEN "status"::text = 'CREATED' THEN 'PENDING_PAYMENT'
    WHEN "status"::text = 'CANCELED' THEN 'CANCELLED'
    ELSE "status"::text
  END
)::"OrderStatus_new";
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Order" RENAME COLUMN "comment" TO "customerComment";
ALTER TABLE "Order"
ADD COLUMN "number" SERIAL NOT NULL,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "fulfillmentStatus" "FulfillmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "subtotalAmount" INTEGER,
ADD COLUMN "deliveryAmount" INTEGER,
ADD COLUMN "deliveryCity" TEXT,
ADD COLUMN "deliveryPostalCode" TEXT,
ADD COLUMN "deliveryComment" TEXT,
ADD COLUMN "managerComment" TEXT,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "Order"
SET "subtotalAmount" = "totalAmount",
    "deliveryAmount" = 0;

ALTER TABLE "Order"
ALTER COLUMN "subtotalAmount" SET NOT NULL,
ALTER COLUMN "deliveryAmount" SET NOT NULL,
ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- AlterTable
ALTER TABLE "OrderItem"
ALTER COLUMN "productId" DROP NOT NULL,
ADD COLUMN "totalPrice" INTEGER,
ADD COLUMN "supplierNameSnapshot" TEXT,
ADD COLUMN "productUrlSnapshot" TEXT,
ADD COLUMN "procurementStatus" "OrderItemProcurementStatus" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN "managerComment" TEXT;

UPDATE "OrderItem"
SET "totalPrice" = "priceSnapshot" * "quantity";

ALTER TABLE "OrderItem" ALTER COLUMN "totalPrice" SET NOT NULL;

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "externalPaymentId" TEXT,
    "paymentUrl" TEXT,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_userId_idempotencyKey_key" ON "Order"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");

-- CreateIndex
CREATE INDEX "Order_fulfillmentStatus_idx" ON "Order"("fulfillmentStatus");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_procurementStatus_idx" ON "OrderItem"("procurementStatus");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_externalPaymentId_idx" ON "Payment"("externalPaymentId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
