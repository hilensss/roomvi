-- ExtendEnum
ALTER TYPE "GenerationScenario" ADD VALUE 'B2B_DEVELOPER_ROOM';
ALTER TYPE "B2BProjectType" ADD VALUE 'DEVELOPER_FLOOR_PLAN';
ALTER TYPE "B2BProjectStatus" ADD VALUE 'ANALYZING';
ALTER TYPE "B2BProjectStatus" ADD VALUE 'REVIEW_REQUIRED';
ALTER TYPE "B2BProjectStatus" ADD VALUE 'PARTIALLY_COMPLETED';

-- CreateEnum
CREATE TYPE "B2BRoomStatus" AS ENUM (
    'DETECTED',
    'REVIEW_REQUIRED',
    'READY_TO_GENERATE',
    'GENERATING',
    'GENERATED',
    'FAILED',
    'SKIPPED'
);

CREATE TYPE "B2BOpeningKind" AS ENUM ('WINDOW', 'DOOR');

CREATE TYPE "B2BAnalysisStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);

-- AlterTable
ALTER TABLE "B2BProject"
ALTER COLUMN "supplierId" DROP NOT NULL,
ALTER COLUMN "roomType" DROP NOT NULL,
ADD COLUMN "sourcePlanFileId" TEXT,
ADD COLUMN "sourcePlanPreviewUrl" TEXT,
ADD COLUMN "defaultCeilingHeightCm" INTEGER NOT NULL DEFAULT 270,
ADD COLUMN "roomsRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "B2BRoom" (
    "id" TEXT NOT NULL,
    "b2bProjectId" TEXT NOT NULL,
    "status" "B2BRoomStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "sourceLabel" TEXT,
    "name" TEXT NOT NULL,
    "roomType" "RoomType",
    "styleOverride" "InteriorStyle",
    "widthCm" INTEGER,
    "depthCm" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "ceilingHeightCm" INTEGER,
    "polygon" JSONB NOT NULL,
    "recognitionConfidence" DOUBLE PRECISION,
    "recognitionNotes" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "isIncluded" BOOLEAN NOT NULL DEFAULT true,
    "roomProjectId" TEXT,
    "shellFileId" TEXT,
    "shellGeometryFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "B2BRoomOpening" (
    "id" TEXT NOT NULL,
    "b2bRoomId" TEXT NOT NULL,
    "kind" "B2BOpeningKind" NOT NULL,
    "wallSegmentIndex" INTEGER NOT NULL,
    "positionRatio" DOUBLE PRECISION NOT NULL,
    "widthCm" INTEGER,
    "recognitionConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "B2BRoomOpening_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FloorPlanAnalysisRun" (
    "id" TEXT NOT NULL,
    "b2bProjectId" TEXT NOT NULL,
    "status" "B2BAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "model" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "errorMessage" TEXT,
    "warnings" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlanAnalysisRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GenerationJob" ADD COLUMN "b2bRoomId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "B2BRoom_roomProjectId_key" ON "B2BRoom"("roomProjectId");
CREATE INDEX "B2BRoom_b2bProjectId_sortOrder_idx" ON "B2BRoom"("b2bProjectId", "sortOrder");
CREATE INDEX "B2BRoom_status_idx" ON "B2BRoom"("status");
CREATE INDEX "B2BProject_sourcePlanFileId_idx" ON "B2BProject"("sourcePlanFileId");
CREATE INDEX "B2BRoomOpening_b2bRoomId_idx" ON "B2BRoomOpening"("b2bRoomId");
CREATE INDEX "FloorPlanAnalysisRun_b2bProjectId_createdAt_idx" ON "FloorPlanAnalysisRun"("b2bProjectId", "createdAt");
CREATE INDEX "FloorPlanAnalysisRun_status_idx" ON "FloorPlanAnalysisRun"("status");
CREATE UNIQUE INDEX "FloorPlanAnalysisRun_one_active_per_project"
ON "FloorPlanAnalysisRun"("b2bProjectId")
WHERE "status" IN ('PENDING', 'PROCESSING');
CREATE INDEX "GenerationJob_b2bRoomId_idx" ON "GenerationJob"("b2bRoomId");

-- AddForeignKey
ALTER TABLE "B2BRoom"
ADD CONSTRAINT "B2BRoom_b2bProjectId_fkey"
FOREIGN KEY ("b2bProjectId") REFERENCES "B2BProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "B2BRoom"
ADD CONSTRAINT "B2BRoom_roomProjectId_fkey"
FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "B2BProject"
ADD CONSTRAINT "B2BProject_sourcePlanFileId_fkey"
FOREIGN KEY ("sourcePlanFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "B2BRoomOpening"
ADD CONSTRAINT "B2BRoomOpening_b2bRoomId_fkey"
FOREIGN KEY ("b2bRoomId") REFERENCES "B2BRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FloorPlanAnalysisRun"
ADD CONSTRAINT "FloorPlanAnalysisRun_b2bProjectId_fkey"
FOREIGN KEY ("b2bProjectId") REFERENCES "B2BProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationJob"
ADD CONSTRAINT "GenerationJob_b2bRoomId_fkey"
FOREIGN KEY ("b2bRoomId") REFERENCES "B2BRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
