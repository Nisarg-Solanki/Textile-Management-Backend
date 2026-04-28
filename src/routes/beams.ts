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
 *         name: quality
 *         schema: { type: string }
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
    const quality = req.query.quality as string | undefined;
    const meterMin = req.query.meter_min as string | undefined;
    const meterMax = req.query.meter_max as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.BeamWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(quality && { beamQuality: quality }),
      ...(meterMin && { beamMeter: { gte: new Prisma.Decimal(meterMin) } }),
      ...(meterMax && { beamMeter: { lte: new Prisma.Decimal(meterMax) } }),
      ...(search && {
        OR: [
          { beamNo: { contains: search, mode: "insensitive" as const } },
          { beamQuality: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.beam.count({ where }),
      prisma.beam.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
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
      include: { firm: { select: { id: true, firmName: true, firmCode: true } } },
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
 *             required: [firmId, beamNo, tar, beamQuality, takaQty, beamMeter]
 *             properties:
 *               firmId: { type: string }
 *               beamNo: { type: string }
 *               tar: { type: integer }
 *               beamQuality: { type: string }
 *               takaQty: { type: integer }
 *               beamMeter: { type: number }
 *     responses:
 *       201:
 *         description: Beam created
 *       409:
 *         description: Duplicate beam number in this firm
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("beams", "create"),
  async (req: Request, res: Response) => {
    const { firmId, beamNo, tar, beamQuality, takaQty, beamMeter } =
      createBeamSchema.parse(req.body);

    const firm = await prisma.firm.findFirst({
      where: { id: firmId, deletedAt: null },
    });
    if (!firm) throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");

    const duplicate = await prisma.beam.findFirst({
      where: { firmId, beamNo, deletedAt: null },
    });
    if (duplicate)
      throw new AppError(
        409,
        "Beam number already exists in this firm",
        "BEAM_NO_DUPLICATE",
      );

    const beam = await prisma.beam.create({
      data: { firmId, beamNo, tar, beamQuality, takaQty, beamMeter },
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
      const firmId = data.firmId ?? existing.firmId;
      const duplicate = await prisma.beam.findFirst({
        where: { firmId, beamNo: data.beamNo, deletedAt: null, NOT: { id } },
      });
      if (duplicate)
        throw new AppError(
          409,
          "Beam number already exists in this firm",
          "BEAM_NO_DUPLICATE",
        );
    }

    const beam = await prisma.beam.update({ where: { id }, data });

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
