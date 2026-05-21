import { Prisma } from "@prisma/client";

import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  CreateProductionInput,
  UpdateProductionInput,
} from "../schemas/production.schema";

const productionInclude = {
  firm: { select: { id: true, firmName: true, firmCode: true } },
  machine: { select: { id: true, machineNo: true, machineType: true } },
  beam: {
    select: {
      id: true,
      beamNo: true,
      beamMeter: true,
      beamQuality: { select: { id: true, name: true } },
    },
  },
  taka: { select: { id: true, takaSrNo: true, takaMeter: true } },
  productionQuality: { select: { id: true, name: true } },
} as const;

type ProductionWithRelations = Prisma.ProductionInfoGetPayload<{
  include: typeof productionInclude;
}>;

export async function createProductionEntry(
  data: CreateProductionInput,
): Promise<ProductionWithRelations> {
  // Step 1 — verify firm exists
  const firm = await prisma.firm.findFirst({
    where: { id: data.firmId, deletedAt: null },
  });
  if (!firm) {
    throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");
  }

  // Step 2 — enforce challanEnable (Rule 2)
  const productionData = { ...data };
  if (!firm.challanEnable) {
    delete productionData.productionChallanNo;
  }

  // Step 3 — verify machine belongs to this firm
  const machine = await prisma.machine.findFirst({
    where: { id: data.machineId, firmId: data.firmId, deletedAt: null },
  });
  if (!machine) {
    throw new AppError(404, "Machine not found in this firm", "MACHINE_NOT_FOUND");
  }

  // Step 4 — verify beam exists and is not already assigned to a different firm
  const beam = await prisma.beam.findFirst({
    where: { id: data.beamId, deletedAt: null },
  });
  if (!beam) {
    throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");
  }
  if (beam.firmId && beam.firmId !== data.firmId) {
    throw new AppError(409, "Beam belongs to a different firm", "BEAM_FIRM_MISMATCH");
  }

  // Step 5 — verify new taka meter won't push total over beam meter
  const takaAgg = await prisma.taka.aggregate({
    _sum: { takaMeter: true },
    where: { beamId: data.beamId, deletedAt: null },
  });
  const existingTakaTotal = takaAgg._sum.takaMeter ?? new Prisma.Decimal(0);
  const projectedTotal = existingTakaTotal.add(new Prisma.Decimal(data.takaMeter));
  if (projectedTotal.greaterThan(beam.beamMeter)) {
    throw new AppError(
      400,
      `Total taka meter (${projectedTotal.toFixed(2)}) would exceed beam meter (${beam.beamMeter.toFixed(2)})`,
      "TAKA_METER_EXCEEDS_BEAM",
    );
  }

  // Step 6 — takaSrNo must be unique within the firm
  const existingTaka = await prisma.productionInfo.findFirst({
    where: { firmId: data.firmId, takaSrNo: data.takaSrNo, deletedAt: null },
  });
  if (existingTaka) {
    throw new AppError(
      409,
      "Taka Sr No already exists in this firm",
      "TAKA_SR_NO_DUPLICATE",
    );
  }

  // Step 5b — takaNo must be unique within the beam
  const existingTakaNo = await prisma.productionInfo.findFirst({
    where: { beamId: data.beamId, takaNo: data.takaNo, deletedAt: null },
  });
  if (existingTakaNo) {
    throw new AppError(
      409,
      "Taka No already exists for this beam",
      "TAKA_NO_DUPLICATE",
    );
  }

  // Step 7 — atomic create (Rule 1)
  return prisma.$transaction(async (tx) => {
    const { entryDate, ...restProductionData } = productionData;
    const production = await tx.productionInfo.create({
      data: {
        ...restProductionData,
        entryDate: new Date(entryDate),
      },
    });
    await tx.taka.create({
      data: {
        firmId: production.firmId,
        productionInfoId: production.id,
        takaSrNo: production.takaSrNo,
        takaMeter: production.takaMeter,
        beamId: production.beamId,
      },
    });
    // Auto-fill beam's firmId on first production use
    if (!beam.firmId) {
      await tx.beam.update({
        where: { id: production.beamId },
        data: { firmId: production.firmId },
      });
    }
    return tx.productionInfo.findUniqueOrThrow({
      where: { id: production.id },
      include: productionInclude,
    });
  });
}

export async function updateProductionEntry(
  id: string,
  data: UpdateProductionInput,
): Promise<ProductionWithRelations> {
  // Step 1 — verify record exists
  const existing = await prisma.productionInfo.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) {
    throw new AppError(404, "Production record not found", "PRODUCTION_NOT_FOUND");
  }

  const updateData = { ...data };

  // Step 2 — if firmId is changing, validate new firm and enforce challanEnable
  if (data.firmId !== undefined) {
    const firm = await prisma.firm.findFirst({
      where: { id: data.firmId, deletedAt: null },
    });
    if (!firm) {
      throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");
    }
    if (!firm.challanEnable) {
      delete updateData.productionChallanNo;
    }
  }

  // Step 3 — takaSrNo uniqueness within firm (exclude current record)
  if (data.takaSrNo !== undefined) {
    const firmId = data.firmId ?? existing.firmId;
    const duplicate = await prisma.productionInfo.findFirst({
      where: {
        firmId,
        takaSrNo: data.takaSrNo,
        deletedAt: null,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new AppError(
        409,
        "Taka Sr No already exists in this firm",
        "TAKA_SR_NO_DUPLICATE",
      );
    }
  }

  // Step 3b — takaNo uniqueness within beam (exclude current record)
  // Triggers when either takaNo or beamId changes — changing beam can cause a collision
  // even if takaNo stays the same.
  if (data.takaNo !== undefined || data.beamId !== undefined) {
    const effectiveBeamIdForTakaNo = data.beamId ?? existing.beamId;
    const effectiveTakaNo = data.takaNo ?? existing.takaNo;
    const duplicateTakaNo = await prisma.productionInfo.findFirst({
      where: {
        beamId: effectiveBeamIdForTakaNo,
        takaNo: effectiveTakaNo,
        deletedAt: null,
        NOT: { id },
      },
    });
    if (duplicateTakaNo) {
      throw new AppError(
        409,
        "Taka No already exists for this beam",
        "TAKA_NO_DUPLICATE",
      );
    }
  }

  // Step 4 — verify updated taka meter won't exceed beam meter
  if (data.takaMeter !== undefined || data.beamId !== undefined) {
    const effectiveBeamId = data.beamId ?? existing.beamId;
    const effectiveTakaMeter =
      data.takaMeter !== undefined
        ? new Prisma.Decimal(data.takaMeter)
        : existing.takaMeter;

    const beamForCheck = await prisma.beam.findFirst({
      where: { id: effectiveBeamId, deletedAt: null },
    });
    if (!beamForCheck) {
      throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");
    }

    const updateTakaAgg = await prisma.taka.aggregate({
      _sum: { takaMeter: true },
      where: { beamId: effectiveBeamId, deletedAt: null, productionInfoId: { not: id } },
    });
    const otherTakaTotal = updateTakaAgg._sum.takaMeter ?? new Prisma.Decimal(0);
    const updateProjected = otherTakaTotal.add(effectiveTakaMeter);
    if (updateProjected.greaterThan(beamForCheck.beamMeter)) {
      throw new AppError(
        400,
        `Total taka meter (${updateProjected.toFixed(2)}) would exceed beam meter (${beamForCheck.beamMeter.toFixed(2)})`,
        "TAKA_METER_EXCEEDS_BEAM",
      );
    }
  }

  // Step 5 — atomic update (Rule 1)
  return prisma.$transaction(async (tx) => {
    const { entryDate, ...restUpdateData } = updateData;
    const production = await tx.productionInfo.update({
      where: { id },
      data: {
        ...restUpdateData,
        ...(entryDate !== undefined ? { entryDate: new Date(entryDate) } : {}),
      },
    });

    // Sync taka only for fields that changed
    const takaUpdateData: {
      takaSrNo?: string;
      takaMeter?: number;
      beamId?: string;
    } = {};
    if (updateData.takaSrNo !== undefined) takaUpdateData.takaSrNo = updateData.takaSrNo;
    if (updateData.takaMeter !== undefined) takaUpdateData.takaMeter = updateData.takaMeter;
    if (updateData.beamId !== undefined) takaUpdateData.beamId = updateData.beamId;

    if (Object.keys(takaUpdateData).length > 0) {
      await tx.taka.update({
        where: { productionInfoId: id },
        data: takaUpdateData,
      });
    }

    return tx.productionInfo.findUniqueOrThrow({
      where: { id: production.id },
      include: productionInclude,
    });
  });
}
