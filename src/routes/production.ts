import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createProductionSchema,
  updateProductionSchema,
} from "../schemas/production.schema";
import {
  createProductionEntry,
  updateProductionEntry,
} from "../services/production.service";

const router = Router();

/**
 * @openapi
 * /api/v1/production:
 *   get:
 *     summary: List production records
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search takaSrNo, productionQuality name, remark
 *       - in: query
 *         name: machine
 *         schema: { type: string }
 *         description: Filter by machineId
 *       - in: query
 *         name: beam
 *         schema: { type: string }
 *         description: Filter by beamId
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: qualityId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: firmId
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of production records
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("production", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const machine = req.query.machine as string | undefined;
    const beam = req.query.beam as string | undefined;
    const date_from = req.query.date_from as string | undefined;
    const date_to = req.query.date_to as string | undefined;
    const qualityId = req.query.qualityId as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.ProductionInfoWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(machine && { machineId: machine }),
      ...(beam && { beamId: beam }),
      ...(qualityId && { productionQualityId: qualityId }),
      ...((date_from || date_to) && {
        entryDate: {
          ...(date_from && { gte: new Date(date_from) }),
          ...(date_to && { lte: new Date(date_to) }),
        },
      }),
      ...(search && {
        OR: [
          { takaNo: { contains: search, mode: "insensitive" as const } },
          { takaSrNo: { contains: search, mode: "insensitive" as const } },
          { productionQuality: { name: { contains: search, mode: "insensitive" as const } } },
          { remark: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, rawList] = await Promise.all([
      prisma.productionInfo.count({ where }),
      prisma.productionInfo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { entryDate: "desc" },
        include: {
          firm: { select: { id: true, firmName: true, firmCode: true } },
          machine: { select: { id: true, machineNo: true, machineType: true } },
          beam: {
            select: {
              id: true,
              beamNo: true,
              beamQuality: { select: { id: true, name: true } },
            },
          },
          taka: { select: { id: true, takaSrNo: true, takaMeter: true } },
          productionQuality: { select: { id: true, name: true } },
          millOutvert: { select: { id: true, firmChallanNo: true, outvertDate: true } },
          millInvert: { select: { id: true, millChallanNo: true, invertDate: true } },
        },
      }),
    ]);

    const data = rawList.map((r) => ({
      ...r,
      taka: r.taka ? { ...r.taka, takaNo: r.takaNo } : null,
    }));

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

/**
 * @openapi
 * /api/v1/production/{id}:
 *   get:
 *     summary: Get a single production record with all linked data
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Production record with machine, beam, taka, mill links
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("production", "view"),
  async (req: Request, res: Response) => {
    const record = await prisma.productionInfo.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
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
        taka: { select: { id: true, takaSrNo: true, takaMeter: true, createdAt: true } },
        productionQuality: { select: { id: true, name: true } },
        millOutvert: { select: { id: true, firmChallanNo: true, outvertDate: true } },
        millInvert: { select: { id: true, millChallanNo: true, invertDate: true } },
      },
    });
    if (!record) {
      throw new AppError(404, "Production record not found", "PRODUCTION_NOT_FOUND");
    }

    res.json({
      success: true,
      data: {
        ...record,
        taka: record.taka ? { ...record.taka, takaNo: record.takaNo } : null,
      },
    });
  },
);

/**
 * @openapi
 * /api/v1/production:
 *   post:
 *     summary: Create a production record (auto-creates linked Taka atomically)
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firmId, machineId, beamId, entryDate, takaSrNo, takaMeter, productionQualityId, weight]
 *             properties:
 *               firmId: { type: string, format: uuid }
 *               machineId: { type: string, format: uuid }
 *               beamId: { type: string, format: uuid }
 *               entryDate: { type: string, format: date-time }
 *               takaSrNo: { type: string }
 *               takaMeter: { type: number }
 *               productionQualityId: { type: string, format: uuid }
 *               weight: { type: number }
 *               remark: { type: string }
 *               productionChallanNo: { type: string }
 *     responses:
 *       201:
 *         description: Production record and Taka created
 *       404:
 *         description: Firm, machine, or beam not found
 *       409:
 *         description: Duplicate takaSrNo in this firm
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("production", "create"),
  async (req: Request, res: Response) => {
    const body = createProductionSchema.parse(req.body);
    const production = await createProductionEntry(body);

    res.status(201).json({
      success: true,
      data: {
        ...production,
        taka: production.taka ? { ...production.taka, takaNo: production.takaNo } : null,
      },
      message: "Created successfully",
    });
  },
);

/**
 * @openapi
 * /api/v1/production/{id}:
 *   put:
 *     summary: Update a production record (syncs linked Taka atomically)
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               takaSrNo: { type: string }
 *               takaMeter: { type: number }
 *               productionQualityId: { type: string, format: uuid }
 *               weight: { type: number }
 *               remark: { type: string }
 *               productionChallanNo: { type: string }
 *     responses:
 *       200:
 *         description: Updated production record
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate takaSrNo
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("production", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    // Strip auto-filled mill fields — written only by mill operations, never by the user
    const body = { ...req.body } as Record<string, unknown>;
    const forbidden = [
      "millOutvertId",
      "millInvertId",
      "millOutvertDate",
      "millInvertDate",
      "millChallanNo",
      "millName",
    ];
    forbidden.forEach((f) => delete body[f]);

    const data = updateProductionSchema.parse(body);
    const production = await updateProductionEntry(id, data);

    res.json({
      success: true,
      data: {
        ...production,
        taka: production.taka ? { ...production.taka, takaNo: production.takaNo } : null,
      },
    });
  },
);

/**
 * @openapi
 * /api/v1/production/{id}:
 *   delete:
 *     summary: Soft delete a production record and its linked Taka
 *     tags: [Production]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       400:
 *         description: Record is linked to active mill operations
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("production", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.productionInfo.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new AppError(404, "Production record not found", "PRODUCTION_NOT_FOUND");
    }

    if (existing.millOutvertId || existing.millInvertId) {
      throw new AppError(
        400,
        "Cannot delete — record is linked to mill operations",
        "PRODUCTION_IN_USE",
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.productionInfo.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await tx.taka.update({
        where: { productionInfoId: id },
        data: { deletedAt: new Date() },
      });
    });

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
