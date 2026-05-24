import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import { createBeamSchema, updateBeamSchema } from "../schemas/beam.schema";

const router = Router();

/**
 * @openapi
 * /api/v1/beams:
 *   get:
 *     summary: List beams
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: qualityId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: meter_min
 *         schema: { type: number }
 *       - in: query
 *         name: meter_max
 *         schema: { type: number }
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
 *         description: Paginated list of beams
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("beams", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const qualityId = req.query.qualityId as string | undefined;
    const meterMin = req.query.meter_min as string | undefined;
    const meterMax = req.query.meter_max as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const getAll = req.query.getAll === "true";

    const where: Prisma.BeamWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(qualityId && { beamQualityId: qualityId }),
      ...(meterMin && { beamMeter: { gte: new Prisma.Decimal(meterMin) } }),
      ...(meterMax && { beamMeter: { lte: new Prisma.Decimal(meterMax) } }),
      ...(search && {
        OR: [
          { beamNo: { contains: search, mode: "insensitive" as const } },
          { beamQuality: { name: { contains: search, mode: "insensitive" as const } } },
        ],
      }),
    };

    const beamSelect = {
      select: {
        id: true,
        beamNo: true,
        tar: true,
        takaQty: true,
        beamMeter: true,
        firm: { select: { firmName: true } },
        beamQuality: { select: { id: true, name: true } },
      },
    } as const;

    if (getAll) {
      const data = await prisma.beam.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...beamSelect,
      });
      return res.json({ success: true, data });
    }

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      prisma.beam.count({ where }),
      prisma.beam.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        ...beamSelect,
      }),
    ]);

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

/**
 * @openapi
 * /api/v1/beams/{id}:
 *   get:
 *     summary: Get a single beam
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Beam record
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("beams", "view"),
  async (req: Request, res: Response) => {
    const beam = await prisma.beam.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: {
        id: true,
        beamNo: true,
        beamQualityId: true,
        tar: true,
        takaQty: true,
        beamMeter: true,
        firm: { select: { firmName: true } },
        beamQuality: { select: { name: true } },
      },
    });
    if (!beam) throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");

    res.json({ success: true, data: beam });
  },
);

/**
 * @openapi
 * /api/v1/beams:
 *   post:
 *     summary: Create a beam
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [beamNo, tar, beamQualityId, takaQty, beamMeter]
 *             properties:
 *               beamNo: { type: string }
 *               tar: { type: integer }
 *               beamQualityId: { type: string, format: uuid }
 *               takaQty: { type: integer }
 *               beamMeter: { type: number }
 *     responses:
 *       201:
 *         description: Beam created
 *       404:
 *         description: Firm or beam quality not found
 *       409:
 *         description: Duplicate beam number in this firm
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("beams", "create"),
  async (req: Request, res: Response) => {
    const { beamNo, tar, beamQualityId, takaQty, beamMeter } =
      createBeamSchema.parse(req.body);

    const quality = await prisma.beamQuality.findFirst({
      where: { id: beamQualityId, deletedAt: null },
    });
    if (!quality)
      throw new AppError(404, "Beam quality not found", "BEAM_QUALITY_NOT_FOUND");

    const duplicate = await prisma.beam.findFirst({
      where: { beamNo, deletedAt: null },
    });
    if (duplicate)
      throw new AppError(
        409,
        "Beam number already exists",
        "BEAM_NO_DUPLICATE",
      );

    const beam = await prisma.beam.create({
      data: { beamNo, tar, beamQualityId, takaQty, beamMeter },
      include: {
        firm: { select: { id: true, firmName: true, firmCode: true } },
        beamQuality: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ success: true, data: beam, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/beams/{id}:
 *   put:
 *     summary: Update a beam
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated beam
 *       404:
 *         description: Not found
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("beams", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = updateBeamSchema.parse(req.body);

    const existing = await prisma.beam.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");

    if (data.beamNo && data.beamNo !== existing.beamNo) {
      const duplicate = await prisma.beam.findFirst({
        where: { beamNo: data.beamNo, deletedAt: null, NOT: { id } },
      });
      if (duplicate)
        throw new AppError(
          409,
          "Beam number already exists",
          "BEAM_NO_DUPLICATE",
        );
    }

    if (data.beamMeter !== undefined) {
      const takaAgg = await prisma.taka.aggregate({
        _sum: { takaMeter: true },
        where: { beamId: id, deletedAt: null },
      });
      const totalTakaMeter = takaAgg._sum.takaMeter ?? new Prisma.Decimal(0);
      if (totalTakaMeter.greaterThan(new Prisma.Decimal(data.beamMeter))) {
        throw new AppError(
          400,
          `Cannot set beam meter to ${data.beamMeter} — existing takas already total ${totalTakaMeter.toFixed(2)} m`,
          "BEAM_METER_TOO_SMALL",
        );
      }
    }

    const beam = await prisma.beam.update({
      where: { id },
      data,
      include: {
        firm: { select: { id: true, firmName: true, firmCode: true } },
        beamQuality: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: beam });
  },
);

/**
 * @openapi
 * /api/v1/beams/{id}:
 *   delete:
 *     summary: Soft delete a beam
 *     tags: [Beams]
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
 *         description: Beam has linked production records
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("beams", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.beam.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");

    const linked = await prisma.productionInfo.count({
      where: { beamId: id, deletedAt: null },
    });
    if (linked > 0)
      throw new AppError(
        400,
        "Cannot delete beam — production records are linked",
        "BEAM_IN_USE",
      );

    await prisma.beam.update({ where: { id }, data: { deletedAt: new Date() } });

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
