import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createMillOutvertSchema,
  updateMillOutvertSchema,
} from "../schemas/millOutvert.schema";
import {
  createMillOutvert,
  updateMillOutvert,
  deleteMillOutvert,
} from "../services/millOutvert.service";

const router = Router();

/**
 * @openapi
 * /api/v1/mill-outverts:
 *   get:
 *     summary: List mill outverts
 *     tags: [MillOutverts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by firmChallanNo
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
 *         description: Paginated list of mill outverts
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("mill_outverts", "view"),
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

    const where: Prisma.MillOutvertWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(mill && { millId: mill }),
      ...((date_from || date_to) && {
        outvertDate: {
          ...(date_from && { gte: new Date(date_from) }),
          ...(date_to && { lte: new Date(date_to) }),
        },
      }),
      ...(search && {
        firmChallanNo: { contains: search, mode: "insensitive" as const },
      }),
    };

    const [total, data] = await Promise.all([
      prisma.millOutvert.count({ where }),
      prisma.millOutvert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { outvertDate: "desc" },
        select: {
          id: true,
          outvertDate: true,
          firmChallanNo: true,
          firm: { select: { firmName: true } },
          mill: { select: { millName: true } },
          outvertTakas: { select: { id: true, takaSrNo: true } },
          millInverts: { select: { invertDate: true, millChallanNo: true } },
          productionInfos: { select: { id: true, takaSrNo: true, millInvertDate: true, millChallanNo: true } },
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
 * /api/v1/mill-outverts/{id}:
 *   get:
 *     summary: Get a single mill outvert with takas and linked production records
 *     tags: [MillOutverts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mill outvert with outvertTakas and productionInfos
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("mill_outverts", "view"),
  async (req: Request, res: Response) => {
    const outvert = await prisma.millOutvert.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: {
        id: true,
        firmId: true,
        millId: true,
        outvertDate: true,
        firmChallanNo: true,
        firm: { select: { firmName: true } },
        mill: { select: { millName: true } },
        outvertTakas: { select: { id: true, takaSrNo: true } },
        millInverts: { select: { invertDate: true, millChallanNo: true } },
        productionInfos: { select: { id: true, takaSrNo: true, millInvertDate: true, millChallanNo: true } },
      },
    });
    if (!outvert) {
      throw new AppError(404, "Mill outvert not found", "MILL_OUTVERT_NOT_FOUND");
    }

    // Resolve takaMeter for each outvertTaka from the Taka table
    const takaSrNos = outvert.outvertTakas.map((t) => t.takaSrNo);
    const takaMeters =
      takaSrNos.length > 0
        ? await prisma.taka.findMany({
            where: { takaSrNo: { in: takaSrNos }, firmId: outvert.firmId, deletedAt: null },
            select: { takaSrNo: true, takaMeter: true },
          })
        : [];
    const meterMap = new Map(takaMeters.map((t) => [t.takaSrNo, t.takaMeter]));
    const outvertTakasWithMeter = outvert.outvertTakas.map((t) => ({
      ...t,
      takaMeter: meterMap.get(t.takaSrNo) ?? null,
    }));

    res.json({ success: true, data: { ...outvert, outvertTakas: outvertTakasWithMeter } });
  },
);

/**
 * @openapi
 * /api/v1/mill-outverts:
 *   post:
 *     summary: Create a mill outvert and sync ProductionInfo records atomically
 *     tags: [MillOutverts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firmId, millId, outvertDate, firmChallanNo, takaSrNos]
 *             properties:
 *               firmId: { type: string, format: uuid }
 *               millId: { type: string, format: uuid }
 *               outvertDate: { type: string, format: date-time }
 *               firmChallanNo: { type: string }
 *               takaSrNos:
 *                 type: array
 *                 items: { type: string }
 *                 minItems: 1
 *     responses:
 *       201:
 *         description: Mill outvert created, ProductionInfo records synced
 *       400:
 *         description: One or more Taka Sr Nos not found
 *       404:
 *         description: Firm or mill not found
 *       409:
 *         description: Challan number already exists for this firm
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("mill_outverts", "create"),
  async (req: Request, res: Response) => {
    const body = createMillOutvertSchema.parse(req.body);
    const outvert = await createMillOutvert(body);

    res.status(201).json({ success: true, data: outvert, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/mill-outverts/{id}:
 *   put:
 *     summary: Update a mill outvert and re-sync ProductionInfo records atomically
 *     tags: [MillOutverts]
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
 *               outvertDate: { type: string, format: date-time }
 *               firmChallanNo: { type: string }
 *               millId: { type: string, format: uuid }
 *               takaSrNos:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Updated mill outvert
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate challan number
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("mill_outverts", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const body = updateMillOutvertSchema.parse(req.body);
    const outvert = await updateMillOutvert(id, body);

    res.json({ success: true, data: outvert });
  },
);

/**
 * @openapi
 * /api/v1/mill-outverts/{id}:
 *   delete:
 *     summary: Soft delete a mill outvert and clear ProductionInfo mill fields
 *     tags: [MillOutverts]
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
  requirePermission("mill_outverts", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    await deleteMillOutvert(id);

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
