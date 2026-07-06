-- AlterEnum
ALTER TYPE "GenerationProvider" ADD VALUE 'NANO_BANANA';

-- AlterTable
ALTER TABLE "GenerationJob" ADD COLUMN     "currentStep" TEXT,
ADD COLUMN     "externalJobId" TEXT,
ADD COLUMN     "progress" INTEGER NOT NULL DEFAULT 0;
