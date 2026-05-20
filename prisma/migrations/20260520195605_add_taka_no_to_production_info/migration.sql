/*
  Warnings:

  - A unique constraint covering the columns `[beamNo]` on the table `beams` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[beamId,takaNo]` on the table `production_info` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "beams" DROP CONSTRAINT "beams_firmId_fkey";

-- DropIndex
DROP INDEX "beams_firmId_beamNo_key";

-- DropIndex
DROP INDEX "beams_firmId_beamQualityId_idx";

-- DropIndex
DROP INDEX "beams_firmId_deletedAt_idx";

-- DropIndex
DROP INDEX "beams_firmId_idx";

-- AlterTable
ALTER TABLE "beams" ALTER COLUMN "firmId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "production_info" ADD COLUMN     "takaNo" TEXT;

-- CreateIndex
CREATE INDEX "beams_beamQualityId_idx" ON "beams"("beamQualityId");

-- CreateIndex
CREATE INDEX "beams_deletedAt_idx" ON "beams"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "beams_beamNo_key" ON "beams"("beamNo");

-- CreateIndex
CREATE INDEX "production_info_beamId_takaNo_idx" ON "production_info"("beamId", "takaNo");

-- CreateIndex
CREATE UNIQUE INDEX "production_info_beamId_takaNo_key" ON "production_info"("beamId", "takaNo");

-- AddForeignKey
ALTER TABLE "beams" ADD CONSTRAINT "beams_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
