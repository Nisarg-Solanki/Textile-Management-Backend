-- Convert every unique constraint on a soft-deletable model from a full
-- unique index to a partial unique index that only applies to non-deleted
-- rows. This lets a record be soft-deleted (deletedAt set) and then
-- re-created with the same business-key values without hitting a duplicate
-- key violation.
--
-- Application-level duplicate checks already filter by deletedAt IS NULL,
-- so this matches the existing semantics — it just stops the DB from
-- rejecting writes that the service layer already considers valid.

-- Firm
DROP INDEX "firms_firmName_key";
DROP INDEX "firms_firmCode_key";
CREATE UNIQUE INDEX "firms_firmName_key" ON "firms"("firmName") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "firms_firmCode_key" ON "firms"("firmCode") WHERE "deletedAt" IS NULL;

-- Mill
DROP INDEX "mills_millName_key";
DROP INDEX "mills_millCode_key";
CREATE UNIQUE INDEX "mills_millName_key" ON "mills"("millName") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "mills_millCode_key" ON "mills"("millCode") WHERE "deletedAt" IS NULL;

-- Machine
DROP INDEX "machines_firmId_machineNo_key";
CREATE UNIQUE INDEX "machines_firmId_machineNo_key" ON "machines"("firmId", "machineNo") WHERE "deletedAt" IS NULL;

-- BeamQuality
DROP INDEX "beam_qualities_name_key";
CREATE UNIQUE INDEX "beam_qualities_name_key" ON "beam_qualities"("name") WHERE "deletedAt" IS NULL;

-- Beam
DROP INDEX "beams_beamNo_key";
CREATE UNIQUE INDEX "beams_beamNo_key" ON "beams"("beamNo") WHERE "deletedAt" IS NULL;

-- ProductionQuality
DROP INDEX "production_qualities_name_key";
CREATE UNIQUE INDEX "production_qualities_name_key" ON "production_qualities"("name") WHERE "deletedAt" IS NULL;

-- ProductionInfo
DROP INDEX "production_info_firmId_takaSrNo_key";
DROP INDEX "production_info_beamId_takaNo_key";
CREATE UNIQUE INDEX "production_info_firmId_takaSrNo_key" ON "production_info"("firmId", "takaSrNo") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "production_info_beamId_takaNo_key" ON "production_info"("beamId", "takaNo") WHERE "deletedAt" IS NULL;

-- Taka
DROP INDEX "takas_firmId_takaSrNo_key";
CREATE UNIQUE INDEX "takas_firmId_takaSrNo_key" ON "takas"("firmId", "takaSrNo") WHERE "deletedAt" IS NULL;

-- MillOutvert
DROP INDEX "mill_outverts_firmId_firmChallanNo_key";
CREATE UNIQUE INDEX "mill_outverts_firmId_firmChallanNo_key" ON "mill_outverts"("firmId", "firmChallanNo") WHERE "deletedAt" IS NULL;

-- MillInvert
DROP INDEX "mill_inverts_millChallanNo_key";
DROP INDEX "mill_inverts_firmId_firmChallanNo_key";
CREATE UNIQUE INDEX "mill_inverts_millChallanNo_key" ON "mill_inverts"("millChallanNo") WHERE "deletedAt" IS NULL;
CREATE UNIQUE INDEX "mill_inverts_firmId_firmChallanNo_key" ON "mill_inverts"("firmId", "firmChallanNo") WHERE "deletedAt" IS NULL;

-- User
DROP INDEX "users_email_key";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email") WHERE "deletedAt" IS NULL;
