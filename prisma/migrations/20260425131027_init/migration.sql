-- CreateTable
CREATE TABLE "firms" (
    "id" TEXT NOT NULL,
    "firmName" TEXT NOT NULL,
    "firmCode" TEXT NOT NULL,
    "challanEnable" BOOLEAN NOT NULL DEFAULT false,
    "srNoSeries" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "firms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mills" (
    "id" TEXT NOT NULL,
    "millName" TEXT NOT NULL,
    "millCode" TEXT,
    "address" TEXT,
    "contactPerson" TEXT,
    "contactNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "machineNo" TEXT NOT NULL,
    "machineType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "remark" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beams" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "beamNo" TEXT NOT NULL,
    "tar" INTEGER NOT NULL,
    "beamQuality" TEXT NOT NULL,
    "takaQty" INTEGER NOT NULL,
    "beamMeter" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "beams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_info" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "beamId" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "takaSrNo" TEXT NOT NULL,
    "takaMeter" DECIMAL(10,2) NOT NULL,
    "productionQuality" TEXT NOT NULL,
    "weight" DECIMAL(10,2) NOT NULL,
    "remark" TEXT,
    "productionChallanNo" TEXT,
    "millOutvertId" TEXT,
    "millInvertId" TEXT,
    "millOutvertDate" TIMESTAMP(3),
    "millChallanNo" TEXT,
    "millName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "production_info_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "takas" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "productionInfoId" TEXT NOT NULL,
    "takaSrNo" TEXT NOT NULL,
    "takaMeter" DECIMAL(10,2) NOT NULL,
    "beamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "takas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mill_outverts" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "millId" TEXT NOT NULL,
    "outvertDate" TIMESTAMP(3) NOT NULL,
    "firmChallanNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mill_outverts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mill_outvert_takas" (
    "id" TEXT NOT NULL,
    "millOutvertId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "takaSrNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mill_outvert_takas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mill_inverts" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "millId" TEXT NOT NULL,
    "millOutvertId" TEXT NOT NULL,
    "invertDate" TIMESTAMP(3) NOT NULL,
    "millChallanNo" TEXT NOT NULL,
    "firmChallanNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mill_inverts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mill_invert_takas" (
    "id" TEXT NOT NULL,
    "millInvertId" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "takaSrNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mill_invert_takas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firmId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "firms_firmName_key" ON "firms"("firmName");

-- CreateIndex
CREATE UNIQUE INDEX "firms_firmCode_key" ON "firms"("firmCode");

-- CreateIndex
CREATE INDEX "firms_status_idx" ON "firms"("status");

-- CreateIndex
CREATE INDEX "firms_deletedAt_idx" ON "firms"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mills_millName_key" ON "mills"("millName");

-- CreateIndex
CREATE UNIQUE INDEX "mills_millCode_key" ON "mills"("millCode");

-- CreateIndex
CREATE INDEX "mills_status_idx" ON "mills"("status");

-- CreateIndex
CREATE INDEX "mills_deletedAt_idx" ON "mills"("deletedAt");

-- CreateIndex
CREATE INDEX "machines_firmId_idx" ON "machines"("firmId");

-- CreateIndex
CREATE INDEX "machines_firmId_status_idx" ON "machines"("firmId", "status");

-- CreateIndex
CREATE INDEX "machines_firmId_deletedAt_idx" ON "machines"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "machines_firmId_machineNo_key" ON "machines"("firmId", "machineNo");

-- CreateIndex
CREATE INDEX "beams_firmId_idx" ON "beams"("firmId");

-- CreateIndex
CREATE INDEX "beams_firmId_beamQuality_idx" ON "beams"("firmId", "beamQuality");

-- CreateIndex
CREATE INDEX "beams_firmId_deletedAt_idx" ON "beams"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "beams_firmId_beamNo_key" ON "beams"("firmId", "beamNo");

-- CreateIndex
CREATE INDEX "production_info_firmId_idx" ON "production_info"("firmId");

-- CreateIndex
CREATE INDEX "production_info_firmId_entryDate_idx" ON "production_info"("firmId", "entryDate");

-- CreateIndex
CREATE INDEX "production_info_firmId_machineId_idx" ON "production_info"("firmId", "machineId");

-- CreateIndex
CREATE INDEX "production_info_firmId_beamId_idx" ON "production_info"("firmId", "beamId");

-- CreateIndex
CREATE INDEX "production_info_firmId_productionQuality_idx" ON "production_info"("firmId", "productionQuality");

-- CreateIndex
CREATE INDEX "production_info_firmId_millOutvertId_idx" ON "production_info"("firmId", "millOutvertId");

-- CreateIndex
CREATE INDEX "production_info_firmId_millInvertId_idx" ON "production_info"("firmId", "millInvertId");

-- CreateIndex
CREATE INDEX "production_info_firmId_deletedAt_idx" ON "production_info"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "production_info_firmId_takaSrNo_key" ON "production_info"("firmId", "takaSrNo");

-- CreateIndex
CREATE UNIQUE INDEX "production_info_firmId_productionChallanNo_key" ON "production_info"("firmId", "productionChallanNo");

-- CreateIndex
CREATE UNIQUE INDEX "takas_productionInfoId_key" ON "takas"("productionInfoId");

-- CreateIndex
CREATE INDEX "takas_firmId_idx" ON "takas"("firmId");

-- CreateIndex
CREATE INDEX "takas_firmId_beamId_idx" ON "takas"("firmId", "beamId");

-- CreateIndex
CREATE INDEX "takas_firmId_deletedAt_idx" ON "takas"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "takas_firmId_takaSrNo_key" ON "takas"("firmId", "takaSrNo");

-- CreateIndex
CREATE INDEX "mill_outverts_firmId_idx" ON "mill_outverts"("firmId");

-- CreateIndex
CREATE INDEX "mill_outverts_firmId_millId_idx" ON "mill_outverts"("firmId", "millId");

-- CreateIndex
CREATE INDEX "mill_outverts_firmId_outvertDate_idx" ON "mill_outverts"("firmId", "outvertDate");

-- CreateIndex
CREATE INDEX "mill_outverts_firmId_deletedAt_idx" ON "mill_outverts"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mill_outverts_firmId_firmChallanNo_key" ON "mill_outverts"("firmId", "firmChallanNo");

-- CreateIndex
CREATE INDEX "mill_outvert_takas_millOutvertId_idx" ON "mill_outvert_takas"("millOutvertId");

-- CreateIndex
CREATE INDEX "mill_outvert_takas_takaSrNo_idx" ON "mill_outvert_takas"("takaSrNo");

-- CreateIndex
CREATE INDEX "mill_outvert_takas_firmId_idx" ON "mill_outvert_takas"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "mill_outvert_takas_millOutvertId_takaSrNo_key" ON "mill_outvert_takas"("millOutvertId", "takaSrNo");

-- CreateIndex
CREATE UNIQUE INDEX "mill_inverts_millChallanNo_key" ON "mill_inverts"("millChallanNo");

-- CreateIndex
CREATE INDEX "mill_inverts_firmId_idx" ON "mill_inverts"("firmId");

-- CreateIndex
CREATE INDEX "mill_inverts_firmId_millId_idx" ON "mill_inverts"("firmId", "millId");

-- CreateIndex
CREATE INDEX "mill_inverts_firmId_invertDate_idx" ON "mill_inverts"("firmId", "invertDate");

-- CreateIndex
CREATE INDEX "mill_inverts_millOutvertId_idx" ON "mill_inverts"("millOutvertId");

-- CreateIndex
CREATE INDEX "mill_inverts_firmId_deletedAt_idx" ON "mill_inverts"("firmId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mill_inverts_firmId_firmChallanNo_key" ON "mill_inverts"("firmId", "firmChallanNo");

-- CreateIndex
CREATE INDEX "mill_invert_takas_millInvertId_idx" ON "mill_invert_takas"("millInvertId");

-- CreateIndex
CREATE INDEX "mill_invert_takas_takaSrNo_idx" ON "mill_invert_takas"("takaSrNo");

-- CreateIndex
CREATE INDEX "mill_invert_takas_firmId_idx" ON "mill_invert_takas"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "mill_invert_takas_millInvertId_takaSrNo_key" ON "mill_invert_takas"("millInvertId", "takaSrNo");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_firmId_idx" ON "users"("firmId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beams" ADD CONSTRAINT "beams_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_beamId_fkey" FOREIGN KEY ("beamId") REFERENCES "beams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_millOutvertId_fkey" FOREIGN KEY ("millOutvertId") REFERENCES "mill_outverts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_info" ADD CONSTRAINT "production_info_millInvertId_fkey" FOREIGN KEY ("millInvertId") REFERENCES "mill_inverts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takas" ADD CONSTRAINT "takas_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takas" ADD CONSTRAINT "takas_productionInfoId_fkey" FOREIGN KEY ("productionInfoId") REFERENCES "production_info"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "takas" ADD CONSTRAINT "takas_beamId_fkey" FOREIGN KEY ("beamId") REFERENCES "beams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_outverts" ADD CONSTRAINT "mill_outverts_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_outverts" ADD CONSTRAINT "mill_outverts_millId_fkey" FOREIGN KEY ("millId") REFERENCES "mills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_outvert_takas" ADD CONSTRAINT "mill_outvert_takas_millOutvertId_fkey" FOREIGN KEY ("millOutvertId") REFERENCES "mill_outverts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_inverts" ADD CONSTRAINT "mill_inverts_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_inverts" ADD CONSTRAINT "mill_inverts_millId_fkey" FOREIGN KEY ("millId") REFERENCES "mills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_inverts" ADD CONSTRAINT "mill_inverts_millOutvertId_fkey" FOREIGN KEY ("millOutvertId") REFERENCES "mill_outverts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mill_invert_takas" ADD CONSTRAINT "mill_invert_takas_millInvertId_fkey" FOREIGN KEY ("millInvertId") REFERENCES "mill_inverts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "firms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
