import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createMillInvertSchema,
  updateMillInvertSchema,
} from "../schemas/millInvert.schema";
import {
  createMillInvert,
  updateMillInvert,
  deleteMillInvert,
} from "../services/millInvert.service";

const router = Router();

/**
 * @openapi
 * /api/v1/mill-inverts:
 *   get:
 *     summary: List mill inverts
 *     tags: [MillInverts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by millChallanNo or firmChallanNo
 *       - in: query
 *         name: mill
 *         schema: { type: string }
 *         description: Filter by millId
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
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
 *         description: Paginated list of mill inverts
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("mill_inverts", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const mill = req.query.mill as string | undefined;
    const date_from = req.query.date_from as string | undefined;
    const date_to = req.query.date_to as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.MillInvertWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(mill && { millId: mill }),
      ...((date_from || date_to) && {
        invertDate: {
          ...(date_from && { gte: new Date(date_from) }),
          ...(date_to && { lte: new Date(date_to) }),
        },
      }),
      ...(search && {
        OR: [
          { millChallanNo: { contains: search, mode: "insensitive" as const } },
          { firmChallanNo: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.millInvert.count({ where }),
      prisma.millInvert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { invertDate: "desc" },
        include: {
          firm: { select: { id: true, firmName: true, firmCode: true } },
          mill: { select: { id: true, millName: true, millCode: true } },
          millOutvert: { select: { id: true, firmChallanNo: true, outvertDate: true } },
          invertTakas: { select: { id: true, takaSrNo: true } },
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
 * /api/v1/mill-inverts/{id}:
 *   get:
 *     summary: Get a single mill invert with takas, mill, outvert, and linked production records
 *     tags: [MillInverts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mill invert with invertTakas and productionInfos
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("mill_inverts", "view"),
  async (req: Request, res: Response) => {
    const invert = await prisma.millInvert.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        firm: { select: { id: true, firmName: true, firmCode: true } },
        mill: { select: { id: true, millName: true, millCode: true } },
        millOutvert: { select: { id: true, firmChallanNo: true, outvertDate: true } },
        invertTakas: { select: { id: true, takaSrNo: true } },
        productionInfos: {
          where: { deletedAt: null },
          select: {
            id: true,
            takaSrNo: true,
            takaMeter: true,
            productionQuality: true,
            entryDate: true,
            millChallanNo: true,
            millName: true,
          },
        },
      },
    });
    if (!invert) {
      throw new AppError(404, "Mill invert not found", "MILL_INVERT_NOT_FOUND");
    }

    res.json({ success: true, data: invert });
  },
);

/**
 * @openapi
 * /api/v1/mill-inverts:
 *   post:
 *     summary: Create a mill invert and sync ProductionInfo records atomically
 *     tags: [MillInverts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firmId, millId, millOutvertId, invertDate, millChallanNo, firmChallanNo, takaSrNos]
 *             properties:
 *               firmId: { type: string, format: uuid }
 *               millId: { type: string, format: uuid }
 *               millOutvertId: { type: string, format: uuid }
 *               invertDate: { type: string, format: date-time }
 *               millChallanNo: { type: string }
 *               firmChallanNo: { type: string }
 *               takaSrNos:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *     responses:
 *       201:
 *         description: Mill invert created, ProductionInfo records synced
 *       400:
 *         description: One or more Taka Sr Nos not found
 *       404:
 *         description: Firm, mill, or mill outvert not found
 *       409:
 *         description: Duplicate challan number
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("mill_inverts", "create"),
  async (req: Request, res: Response) => {
    const body = createMillInvertSchema.parse(req.body);
    const invert = await createMillInvert(body);

    res.status(201).json({ success: true, data: invert, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/mill-inverts/{id}:
 *   put:
 *     summary: Update a mill invert and re-sync ProductionInfo records atomically
 *     tags: [MillInverts]
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
 *               invertDate: { type: string, format: date-time }
 *               millChallanNo: { type: string }
 *               firmChallanNo: { type: string }
 *               millId: { type: string, format: uuid }
 *               millOutvertId: { type: string, format: uuid }
 *               takaSrNos:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Updated mill invert
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate challan number
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("mill_inverts", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = updateMillInvertSchema.parse(req.body);
    const invert = await updateMillInvert(id, body);

    res.json({ success: true, data: invert });
  },
);

/**
 * @openapi
 * /api/v1/mill-inverts/{id}:
 *   delete:
 *     summary: Soft delete a mill invert and clear ProductionInfo invert fields
 *     tags: [MillInverts]
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
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("mill_inverts", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await deleteMillInvert(id);

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
