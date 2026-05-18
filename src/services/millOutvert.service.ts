import { Prisma } from "@prisma/client";

import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import {
  CreateMillOutvertInput,
  UpdateMillOutvertInput,
} from "../schemas/millOutvert.schema";

const millOutvertInclude = {
  firm: { select: { id: true, firmName: true, firmCode: true } },
  mill: { select: { id: true, millName: true, millCode: true } },
  outvertTakas: { select: { id: true, takaSrNo: true } },
} as const;

type MillOutvertWithRelations = Prisma.MillOutvertGetPayload<{
  include: typeof millOutvertInclude;
}>;

export async function createMillOutvert(
  data: CreateMillOutvertInput,
): Promise<MillOutvertWithRelations> {
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

  // Step 3 — firmChallanNo must be unique per firm
  const existingChallan = await prisma.millOutvert.findFirst({
    where: { firmId: data.firmId, firmChallanNo: data.firmChallanNo, deletedAt: null },
  });
  if (existingChallan) {
    throw new AppError(
      409,
      "Challan number already exists for this firm",
      "CHALLAN_DUPLICATE",
    );
  }

  // Step 4 — verify all takaSrNos exist in productionInfo for this firm
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

  // Step 5 — atomic create + ProductionInfo sync (Rule 3)
  return prisma.$transaction(async (tx) => {
    const outvert = await tx.millOutvert.create({
      data: {
        firmId: data.firmId,
        millId: data.millId,
        outvertDate: new Date(data.outvertDate),
        firmChallanNo: data.firmChallanNo,
      },
    });

    await tx.millOutvertTaka.createMany({
      data: data.takaSrNos.map((t) => ({
        millOutvertId: outvert.id,
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
        millOutvertId: outvert.id,
        millOutvertDate: outvert.outvertDate,
        millName: mill.millName,
      },
    });

    return tx.millOutvert.findUniqueOrThrow({
      where: { id: outvert.id },
      include: millOutvertInclude,
    });
  });
}

export async function updateMillOutvert(
  id: string,
  data: UpdateMillOutvertInput,
): Promise<MillOutvertWithRelations> {
  // Step 1 — find existing outvert with its takas
  const existing = await prisma.millOutvert.findFirst({
    where: { id, deletedAt: null },
    include: { outvertTakas: true },
  });
  if (!existing) {
    throw new AppError(404, "Mill outvert not found", "MILL_OUTVERT_NOT_FOUND");
  }

  // Step 2 — if firmChallanNo is changing, check uniqueness (exclude current id)
  if (data.firmChallanNo !== undefined && data.firmChallanNo !== existing.firmChallanNo) {
    const firmId = data.firmId ?? existing.firmId;
    const duplicate = await prisma.millOutvert.findFirst({
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
        "Challan number already exists for this firm",
        "CHALLAN_DUPLICATE",
      );
    }
  }

  // Step 3 — if millId is changing, verify new mill exists
  if (data.millId !== undefined) {
    const mill = await prisma.mill.findFirst({
      where: { id: data.millId, deletedAt: null },
    });
    if (!mill) {
      throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");
    }
  }

  // Step 4 — if takaSrNos provided, verify all exist in productionInfo
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
    const { outvertDate, takaSrNos, ...restData } = data;

    const updated = await tx.millOutvert.update({
      where: { id },
      data: {
        ...restData,
        ...(outvertDate !== undefined ? { outvertDate: new Date(outvertDate) } : {}),
      },
    });

    if (takaSrNos !== undefined) {
      const firmId = data.firmId ?? existing.firmId;
      const millId = data.millId ?? existing.millId;
      const oldTakaSrNos = existing.outvertTakas.map((t) => t.takaSrNo);

      // Resolve mill name for ProductionInfo sync
      const mill = await tx.mill.findFirst({ where: { id: millId, deletedAt: null } });
      if (!mill) {
        throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");
      }

      // Clear ProductionInfo mill fields for old takas before replacing
      if (oldTakaSrNos.length > 0) {
        await tx.productionInfo.updateMany({
          where: {
            takaSrNo: { in: oldTakaSrNos },
            firmId: existing.firmId,
            deletedAt: null,
          },
          data: { millOutvertId: null, millOutvertDate: null, millName: null },
        });
      }

      await tx.millOutvertTaka.deleteMany({ where: { millOutvertId: id } });
      await tx.millOutvertTaka.createMany({
        data: takaSrNos.map((t) => ({ millOutvertId: id, firmId, takaSrNo: t })),
      });

      await tx.productionInfo.updateMany({
        where: { takaSrNo: { in: takaSrNos }, firmId, deletedAt: null },
        data: {
          millOutvertId: id,
          millOutvertDate: updated.outvertDate,
          millName: mill.millName,
        },
      });
    }

    return tx.millOutvert.findUniqueOrThrow({
      where: { id },
      include: millOutvertInclude,
    });
  });
}

export async function deleteMillOutvert(id: string): Promise<void> {
  // Step 1 — find existing outvert with its takas
  const existing = await prisma.millOutvert.findFirst({
    where: { id, deletedAt: null },
    include: { outvertTakas: true },
  });
  if (!existing) {
    throw new AppError(404, "Mill outvert not found", "MILL_OUTVERT_NOT_FOUND");
  }

  const takaSrNos = existing.outvertTakas.map((t) => t.takaSrNo);

  // Step 2 — atomic: clear ProductionInfo, delete junction rows, soft-delete outvert (Rules 3, 5)
  await prisma.$transaction(async (tx) => {
    if (takaSrNos.length > 0) {
      await tx.productionInfo.updateMany({
        where: {
          takaSrNo: { in: takaSrNos },
          firmId: existing.firmId,
          deletedAt: null,
        },
        data: { millOutvertId: null, millOutvertDate: null, millName: null },
      });
    }

    await tx.millOutvertTaka.deleteMany({ where: { millOutvertId: id } });

    await tx.millOutvert.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  });
}
