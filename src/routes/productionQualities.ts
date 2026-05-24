import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createProductionQualitySchema,
  updateProductionQualitySchema,
} from "../schemas/productionQuality.schema";

const router = Router();

/**
 * @openapi
 * /api/v1/production-qualities:
 *   get:
 *     summary: List production qualities
 *     tags: [ProductionQualities]
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
 *         description: Paginated list of production qualities
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("production_qualities", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.ProductionQualityWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(search && {
        OR: [{ name: { contains: search, mode: "insensitive" as const } }],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.productionQuality.count({ where }),
      prisma.productionQuality.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
        },
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
 * /api/v1/production-qualities/{id}:
 *   get:
 *     summary: Get a single production quality
 *     tags: [ProductionQualities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Production quality record
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("production_qualities", "view"),
  async (req: Request, res: Response) => {
    const productionQuality = await prisma.productionQuality.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!productionQuality)
      throw new AppError(
        404,
        "Production quality not found",
        "PRODUCTION_QUALITY_NOT_FOUND",
      );

    res.json({ success: true, data: productionQuality });
  },
);

/**
 * @openapi
 * /api/v1/production-qualities:
 *   post:
 *     summary: Create a production quality
 *     tags: [ProductionQualities]
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
 *         description: Production quality created
 *       409:
 *         description: Duplicate name
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("production_qualities", "create"),
  async (req: Request, res: Response) => {
    const { name } = createProductionQualitySchema.parse(req.body);

    const duplicate = await prisma.productionQuality.findFirst({
      where: { name, deletedAt: null },
    });
    if (duplicate)
      throw new AppError(
        409,
        "Production quality name already exists",
        "PRODUCTION_QUALITY_DUPLICATE",
      );

    const productionQuality = await prisma.productionQuality.create({
      data: { name },
    });

    res
      .status(201)
      .json({ success: true, data: productionQuality, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/production-qualities/{id}:
 *   put:
 *     summary: Update a production quality
 *     tags: [ProductionQualities]
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
 *         description: Updated production quality
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate name
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("production_qualities", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = updateProductionQualitySchema.parse(req.body);

    const existing = await prisma.productionQuality.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(
        404,
        "Production quality not found",
        "PRODUCTION_QUALITY_NOT_FOUND",
      );

    if (data.name && data.name !== existing.name) {
      const duplicate = await prisma.productionQuality.findFirst({
        where: { name: data.name, deletedAt: null, NOT: { id } },
      });
      if (duplicate)
        throw new AppError(
          409,
          "Production quality name already exists",
          "PRODUCTION_QUALITY_DUPLICATE",
        );
    }

    const productionQuality = await prisma.productionQuality.update({
      where: { id },
      data,
    });

    res.json({ success: true, data: productionQuality });
  },
);

/**
 * @openapi
 * /api/v1/production-qualities/{id}:
 *   delete:
 *     summary: Soft delete a production quality
 *     tags: [ProductionQualities]
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
 *         description: Production quality is in use by production records
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("production_qualities", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.productionQuality.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(
        404,
        "Production quality not found",
        "PRODUCTION_QUALITY_NOT_FOUND",
      );

    const linked = await prisma.productionInfo.count({
      where: { productionQualityId: id, deletedAt: null },
    });
    if (linked > 0)
      throw new AppError(
        400,
        "Cannot delete — production records are linked",
        "PRODUCTION_QUALITY_IN_USE",
      );

    await prisma.productionQuality.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
