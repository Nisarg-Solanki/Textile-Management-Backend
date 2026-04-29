import { Prisma } from "@prisma/client";

import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  CreateMillInvertInput,
  UpdateMillInvertInput,
} from "../schemas/millInvert.schema";

type MillInvertWithTakas = Prisma.MillInvertGetPayload<{
  include: { invertTakas: true };
}>;

export async function createMillInvert(
  data: CreateMillInvertInput,
): Promise<MillInvertWithTakas> {
  // Step 1 — verify firm exists
  const firm = await prisma.firm.findFirst({
    where: { id: data.firmId, deletedAt: null },
  });
  if (!firm) {
    throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");
  }

  // Step 2 — verify mill exists
  const mill = await prisma.mill.findFirst({
    where: { id: data.millId, deletedAt: null },
  });
  if (!mill) {
    throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");
  }

  // Step 3 — verify millOutvert belongs to this firm and is not deleted
  const millOutvert = await prisma.millOutvert.findFirst({
    where: { id: data.millOutvertId, firmId: data.firmId, deletedAt: null },
  });
  if (!millOutvert) {
    throw new AppError(404, "Mill outvert not found", "MILL_OUTVERT_NOT_FOUND");
  }

  // Step 4 — millChallanNo must be globally unique
  const existingMillChallan = await prisma.millInvert.findFirst({
    where: { millChallanNo: data.millChallanNo },
  });
  if (existingMillChallan) {
    throw new AppError(
      409,
      "Mill challan number already exists",
      "MILL_CHALLAN_DUPLICATE",
    );
  }

  // Step 5 — firmChallanNo must be unique per firm (excluding soft-deleted)
  const existingFirmChallan = await prisma.millInvert.findFirst({
    where: { firmId: data.firmId, firmChallanNo: data.firmChallanNo, deletedAt: null },
  });
  if (existingFirmChallan) {
    throw new AppError(
      409,
      "Firm challan number already exists for this firm",
      "FIRM_CHALLAN_DUPLICATE",
    );
  }

  // Step 6 — verify all takaSrNos exist in productionInfo for this firm
  const matchingCount = await prisma.productionInfo.count({
    where: {
      takaSrNo: { in: data.takaSrNos },
      firmId: data.firmId,
      deletedAt: null,
    },
  });
  if (matchingCount < data.takaSrNos.length) {
    throw new AppError(400, "One or more Taka Sr Nos not found", "TAKA_NOT_FOUND");
  }

  // Step 7+8 — atomic create + ProductionInfo sync (Rule 4)
  return prisma.$transaction(async (tx) => {
    const invert = await tx.millInvert.create({
      data: {
        firmId: data.firmId,
        millId: data.millId,
        millOutvertId: data.millOutvertId,
        invertDate: new Date(data.invertDate),
        millChallanNo: data.millChallanNo,
        firmChallanNo: data.firmChallanNo,
      },
    });

    await tx.millInvertTaka.createMany({
      data: data.takaSrNos.map((t) => ({
        millInvertId: invert.id,
        firmId: data.firmId,
        takaSrNo: t,
      })),
    });

    await tx.productionInfo.updateMany({
      where: {
        takaSrNo: { in: data.takaSrNos },
        firmId: data.firmId,
        deletedAt: null,
      },
      data: {
        millInvertId: invert.id,
        millChallanNo: data.millChallanNo,
        millName: mill.millName,
      },
    });

    return tx.millInvert.findUniqueOrThrow({
      where: { id: invert.id },
      include: { invertTakas: true },
    });
  });
}

export async function updateMillInvert(
  id: string,
  data: UpdateMillInvertInput,
): Promise<MillInvertWithTakas> {
  // Step 1 — find existing invert with its takas
  const existing = await prisma.millInvert.findFirst({
    where: { id, deletedAt: null },
    include: { invertTakas: true },
  });
  if (!existing) {
    throw new AppError(404, "Mill invert not found", "MILL_INVERT_NOT_FOUND");
  }

  // Step 2 — if millChallanNo changing, check global uniqueness (exclude current id)
  if (data.millChallanNo !== undefined && data.millChallanNo !== existing.millChallanNo) {
    const duplicate = await prisma.millInvert.findFirst({
      where: { millChallanNo: data.millChallanNo, NOT: { id } },
    });
    if (duplicate) {
      throw new AppError(
        409,
        "Mill challan number already exists",
        "MILL_CHALLAN_DUPLICATE",
      );
    }
  }

  // Step 3 — if firmChallanNo changing, check per-firm uniqueness (exclude current id)
  if (data.firmChallanNo !== undefined && data.firmChallanNo !== existing.firmChallanNo) {
    const firmId = data.firmId ?? existing.firmId;
    const duplicate = await prisma.millInvert.findFirst({
      where: {
        firmId,
        firmChallanNo: data.firmChallanNo,
        deletedAt: null,
        NOT: { id },
      },
    });
    if (duplicate) {
      throw new AppError(
        409,
        "Firm challan number already exists for this firm",
        "FIRM_CHALLAN_DUPLICATE",
      );
    }
  }

  // Step 4 — if millOutvertId changing, verify it belongs to the correct firm
  if (data.millOutvertId !== undefined && data.millOutvertId !== existing.millOutvertId) {
    const firmId = data.firmId ?? existing.firmId;
    const millOutvert = await prisma.millOutvert.findFirst({
      where: { id: data.millOutvertId, firmId, deletedAt: null },
    });
    if (!millOutvert) {
      throw new AppError(404, "Mill outvert not found", "MILL_OUTVERT_NOT_FOUND");
    }
  }

  // Step 5 — if takaSrNos provided, verify all exist in productionInfo
  if (data.takaSrNos !== undefined) {
    const firmId = data.firmId ?? existing.firmId;
    const matchingCount = await prisma.productionInfo.count({
      where: {
        takaSrNo: { in: data.takaSrNos },
        firmId,
        deletedAt: null,
      },
    });
    if (matchingCount < data.takaSrNos.length) {
      throw new AppError(400, "One or more Taka Sr Nos not found", "TAKA_NOT_FOUND");
    }
  }

  return prisma.$transaction(async (tx) => {
    const { invertDate, takaSrNos, ...restData } = data;

    const updated = await tx.millInvert.update({
      where: { id },
      data: {
        ...restData,
        ...(invertDate !== undefined ? { invertDate: new Date(invertDate) } : {}),
      },
    });

    if (takaSrNos !== undefined) {
      const firmId = data.firmId ?? existing.firmId;
      const millId = data.millId ?? existing.millId;
      const oldTakaSrNos = existing.invertTakas.map((t) => t.takaSrNo);

      // Resolve mill name for ProductionInfo sync
      const mill = await tx.mill.findFirst({ where: { id: millId, deletedAt: null } });
      if (!mill) {
        throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");
      }

      // Clear ProductionInfo invert fields for old takas before replacing
      if (oldTakaSrNos.length > 0) {
        await tx.productionInfo.updateMany({
          where: {
            takaSrNo: { in: oldTakaSrNos },
            firmId: existing.firmId,
            deletedAt: null,
          },
          data: { millInvertId: null, millChallanNo: null, millName: null },
        });
      }

      await tx.millInvertTaka.deleteMany({ where: { millInvertId: id } });
      await tx.millInvertTaka.createMany({
        data: takaSrNos.map((t) => ({ millInvertId: id, firmId, takaSrNo: t })),
      });

      await tx.productionInfo.updateMany({
        where: { takaSrNo: { in: takaSrNos }, firmId, deletedAt: null },
        data: {
          millInvertId: id,
          millChallanNo: updated.millChallanNo,
          millName: mill.millName,
        },
      });
    }

    return tx.millInvert.findUniqueOrThrow({
      where: { id },
      include: { invertTakas: true },
    });
  });
}

export async function deleteMillInvert(id: string): Promise<void> {
  // Step 1 — find existing invert with its takas
  const existing = await prisma.millInvert.findFirst({
    where: { id, deletedAt: null },
    include: { invertTakas: true },
  });
  if (!existing) {
    throw new AppError(404, "Mill invert not found", "MILL_INVERT_NOT_FOUND");
  }

  const takaSrNos = existing.invertTakas.map((t) => t.takaSrNo);

  // Step 2 — atomic: clear ProductionInfo invert fields, delete junction rows, soft-delete invert (Rules 4, 5)
  await prisma.$transaction(async (tx) => {
    if (takaSrNos.length > 0) {
      await tx.productionInfo.updateMany({
        where: {
          takaSrNo: { in: takaSrNos },
          deletedAt: null,
        },
        data: { millInvertId: null, millChallanNo: null, millName: null },
      });
    }

    await tx.millInvertTaka.deleteMany({ where: { millInvertId: id } });

    await tx.millInvert.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  });
}
