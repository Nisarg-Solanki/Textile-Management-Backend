import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";

const router = Router();

/**
 * @openapi
 * /api/v1/mill-summary:
 *   get:
 *     summary: Mill dispatch/receipt summary per taka (auto-generated view)
 *     tags: [MillSummary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by takaSrNo
 *       - in: query
 *         name: mill
 *         schema: { type: string }
 *         description: Filter by mill name (case-insensitive contains)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [sent, returned, pending] }
 *         description: "sent = outvert exists, no invert; returned = invert exists; pending = no outvert"
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *         description: Filter millOutvertDate >= date_from
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
 *         description: Filter millOutvertDate <= date_to
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
 *         description: Paginated mill summary
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("mill_summary", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const mill = req.query.mill as string | undefined;
    const status = req.query.status as string | undefined;
    const dateFrom = req.query.date_from as string | undefined;
    const dateTo = req.query.date_to as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const statusFilter: Prisma.ProductionInfoWhereInput =
      status === "sent"
        ? { millOutvertId: { not: null }, millInvertId: null }
        : status === "returned"
          ? { millInvertId: { not: null } }
          : status === "pending"
            ? { millOutvertId: null }
            : {};

    const where: Prisma.ProductionInfoWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(search && {
        takaSrNo: { contains: search, mode: "insensitive" as const },
      }),
      ...(dateFrom && { millOutvertDate: { gte: new Date(dateFrom) } }),
      ...(dateTo && { millOutvertDate: { lte: new Date(dateTo) } }),
      ...statusFilter,
      ...(mill && {
        millName: { contains: mill, mode: "insensitive" as const },
      }),
    };

    const [total, rows] = await Promise.all([
      prisma.productionInfo.count({ where }),
      prisma.productionInfo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          takaSrNo: true,
          millOutvertDate: true,
          millChallanNo: true,
          millName: true,
          millOutvertId: true,
          millInvertId: true,
          taka: { select: { id: true } },
          millOutvert: {
            select: { outvertDate: true, firmChallanNo: true },
          },
          millInvert: {
            select: { invertDate: true, millChallanNo: true },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

export default router;
