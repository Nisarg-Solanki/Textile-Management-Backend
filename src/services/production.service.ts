import { ProductionInfo } from "@prisma/client";

import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  CreateProductionInput,
  UpdateProductionInput,
} from "../schemas/production.schema";

export async function createProductionEntry(
  data: CreateProductionInput,
): Promise<ProductionInfo> {
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

  // Step 4 — verify beam belongs to this firm
  const beam = await prisma.beam.findFirst({
    where: { id: data.beamId, firmId: data.firmId, deletedAt: null },
  });
  if (!beam) {
    throw new AppError(404, "Beam not found in this firm", "BEAM_NOT_FOUND");
  }

  // Step 5 — takaSrNo must be unique within the firm
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

  // Step 6 — atomic create (Rule 1)
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
    return production;
  });
}

export async function updateProductionEntry(
  id: string,
  data: UpdateProductionInput,
): Promise<ProductionInfo> {
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

  // Step 4 — atomic update (Rule 1)
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

    return production;
  });
}
