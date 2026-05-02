/*
  Warnings:

  - You are about to drop the column `beamQuality` on the `beams` table. All the data in the column will be lost.
  - You are about to drop the column `productionQuality` on the `production_info` table. All the data in the column will be lost.
  - Added the required column `beamQualityId` to the `beams` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productionQualityId` to the `production_info` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "beams_firmId_beamQuality_idx";

-- DropIndex
DROP INDEX "production_info_firmId_productionQuality_idx";

-- AlterTable
ALTER TABLE "beams" DROP COLUMN "beamQuality",
ADD COLUMN     "beamQualityId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "production_info" DROP COLUMN "productionQuality",
ADD COLUMN     "productionQualityId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "beam_qualities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "beam_qualities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_qualities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_qualities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "beam_qualities_name_key" ON "beam_qualities"("name");

-- CreateIndex
CREATE INDEX "beam_qualities_status_idx" ON "beam_qualities"("status");

-- CreateIndex
CREATE INDEX "beam_qualities_deletedAt_idx" ON "beam_qualities"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "production_qualities_name_key" ON "production_qualities"("name");

-- CreateIndex
CREATE INDEX "production_qualities_status_idx" ON "production_qualities"("status");

-- CreateIndex
CREATE INDEX "production_qualities_deletedAt_idx" ON "production_qualities"("deletedAt");

-- CreateIndex
CREATE INDEX "beams_firmId_beamQualityId_idx" ON "beams"("firmId", "beamQualityId");

-- CreateIndex
CREATE INDEX "production_info_firmId_productionQualityId_idx" ON "production_info"("firmId", "productionQualityId");

-- AddForeignKey
ALTER TABLE "beams" ADD CONSTRAINT "beams_beamQualityId_fkey" FOREIGN KEY ("beamQualityId") REFERENCES "beam_qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_productionQualityId_fkey" FOREIGN KEY ("productionQualityId") REFERENCES "production_qualities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
