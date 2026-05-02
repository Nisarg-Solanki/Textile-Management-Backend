import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createBeamQualitySchema,
  updateBeamQualitySchema,
} from "../schemas/beamQuality.schema";

const router = Router();

/**
 * @openapi
 * /api/v1/beam-qualities:
 *   get:
 *     summary: List beam qualities
 *     tags: [BeamQualities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive] }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of beam qualities
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("beam_qualities", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.BeamQualityWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [{ name: { contains: search, mode: "insensitive" as const } }],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.beamQuality.count({ where }),
      prisma.beamQuality.findMany({
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
 * /api/v1/beam-qualities/{id}:
 *   get:
 *     summary: Get a single beam quality
 *     tags: [BeamQualities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Beam quality record
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("beam_qualities", "view"),
  async (req: Request, res: Response) => {
    const beamQuality = await prisma.beamQuality.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!beamQuality)
      throw new AppError(
        404,
        "Beam quality not found",
        "BEAM_QUALITY_NOT_FOUND",
      );

    res.json({ success: true, data: beamQuality });
  },
);

/**
 * @openapi
 * /api/v1/beam-qualities:
 *   post:
 *     summary: Create a beam quality
 *     tags: [BeamQualities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *     responses:
 *       201:
 *         description: Beam quality created
 *       409:
 *         description: Duplicate name
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("beam_qualities", "create"),
  async (req: Request, res: Response) => {
    const { name } = createBeamQualitySchema.parse(req.body);

    const duplicate = await prisma.beamQuality.findFirst({
      where: { name, deletedAt: null },
    });
    if (duplicate)
      throw new AppError(
        409,
        "Beam quality name already exists",
        "BEAM_QUALITY_DUPLICATE",
      );

    const beamQuality = await prisma.beamQuality.create({ data: { name } });

    res
      .status(201)
      .json({ success: true, data: beamQuality, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/beam-qualities/{id}:
 *   put:
 *     summary: Update a beam quality
 *     tags: [BeamQualities]
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
 *               name: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       200:
 *         description: Updated beam quality
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate name
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("beam_qualities", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = updateBeamQualitySchema.parse(req.body);

    const existing = await prisma.beamQuality.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(
        404,
        "Beam quality not found",
        "BEAM_QUALITY_NOT_FOUND",
      );

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.beamQuality.findFirst({
        where: { name: data.name, deletedAt: null, NOT: { id } },
      });
      if (duplicate)
        throw new AppError(
          409,
          "Beam quality name already exists",
          "BEAM_QUALITY_DUPLICATE",
        );
    }

    const beamQuality = await prisma.beamQuality.update({ where: { id }, data });

    res.json({ success: true, data: beamQuality });
  },
);

/**
 * @openapi
 * /api/v1/beam-qualities/{id}:
 *   delete:
 *     summary: Soft delete a beam quality
 *     tags: [BeamQualities]
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
 *         description: Beam quality is in use by beams
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("beam_qualities", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.beamQuality.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(
        404,
        "Beam quality not found",
        "BEAM_QUALITY_NOT_FOUND",
      );

    const linked = await prisma.beam.count({
      where: { beamQualityId: id, deletedAt: null },
    });
    if (linked > 0)
      throw new AppError(
        400,
        "Cannot delete — beams are linked",
        "BEAM_QUALITY_IN_USE",
      );

    await prisma.beamQuality.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
