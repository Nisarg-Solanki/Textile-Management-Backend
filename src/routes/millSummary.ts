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
 *     summary: Mill dispatch/receipt summary grouped by firm challan number
 *     tags: [MillSummary]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by takaSrNo within a challan group
 *       - in: query
 *         name: mill
 *         schema: { type: string }
 *         description: Filter by mill name (case-insensitive contains)
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [sent, returned, pending] }
 *         description: "sent = outvert exists with no active invert; returned = active invert exists; pending = no outvert"
 *       - in: query
 *         name: date_from
 *         schema: { type: string, format: date }
 *         description: Filter outvertDate >= date_from
 *       - in: query
 *         name: date_to
 *         schema: { type: string, format: date }
 *         description: Filter outvertDate <= date_to
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
 *         description: >
 *           Grouped mill summary. Each item represents one firm challan (outvert).
 *           status=pending returns individual production entries with null challan fields.
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

    if (status === "pending") {
      const pendingWhere: Prisma.ProductionInfoWhereInput = {
        deletedAt: null,
        millOutvertId: null,
        ...(firmId && { firmId }),
        ...(search && {
          takaSrNo: { contains: search, mode: "insensitive" as const },
        }),
      };

      const [total, rows] = await Promise.all([
        prisma.productionInfo.count({ where: pendingWhere }),
        prisma.productionInfo.findMany({
          where: pendingWhere,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            takaSrNo: true,
            takaMeter: true,
            entryDate: true,
            weight: true,
            remark: true,
            productionChallanNo: true,
            millOutvertId: true,
            millOutvertDate: true,
            millInvertId: true,
            millChallanNo: true,
            millName: true,
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
            productionQuality: { select: { id: true, name: true } },
            millOutvert: {
              select: { id: true, firmChallanNo: true, outvertDate: true },
            },
            millInvert: {
              select: { id: true, millChallanNo: true, invertDate: true },
            },
            taka: { select: { id: true } },
          },
        }),
      ]);

      const data = rows.map((production) => ({
        firmChallanNo: null as string | null,
        firm: production.firm,
        mill: null as { id: string; millName: string; millCode: string | null } | null,
        millOutvertId: null as string | null,
        outvertDate: null as Date | null,
        invertDate: null as Date | null,
        millChallanNo: null as string | null,
        millInvertId: null as string | null,
        status: "pending" as const,
        productions: [production],
        takaCount: 1,
      }));

      return res.json({
        success: true,
        data,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    }

    // Grouped view — paginate by MillOutvert (one group per firmChallanNo)
    const outvertWhere: Prisma.MillOutvertWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(mill && {
        mill: { millName: { contains: mill, mode: "insensitive" as const } },
      }),
      ...(dateFrom && { outvertDate: { gte: new Date(dateFrom) } }),
      ...(dateTo && { outvertDate: { lte: new Date(dateTo) } }),
      ...(status === "sent" && {
        millInverts: { none: { deletedAt: null } },
      }),
      ...(status === "returned" && {
        millInverts: { some: { deletedAt: null } },
      }),
      ...(search && {
        outvertTakas: {
          some: {
            takaSrNo: { contains: search, mode: "insensitive" as const },
          },
        },
      }),
    };

    const [total, outverts] = await Promise.all([
      prisma.millOutvert.count({ where: outvertWhere }),
      prisma.millOutvert.findMany({
        where: outvertWhere,
        skip,
        take: limit,
        orderBy: { outvertDate: "desc" },
        include: {
          firm: { select: { id: true, firmName: true, firmCode: true } },
          mill: { select: { id: true, millName: true, millCode: true } },
          millInverts: {
            where: { deletedAt: null },
            select: { id: true, invertDate: true, millChallanNo: true },
            orderBy: { invertDate: "desc" },
            take: 1,
          },
          productionInfos: {
            where: { deletedAt: null },
            select: {
              id: true,
              takaSrNo: true,
              takaMeter: true,
              entryDate: true,
              weight: true,
              remark: true,
              productionChallanNo: true,
              millOutvertId: true,
              millOutvertDate: true,
              millInvertId: true,
              millChallanNo: true,
              millName: true,
              machine: { select: { id: true, machineNo: true, machineType: true } },
              beam: {
                select: {
                  id: true,
                  beamNo: true,
                  beamMeter: true,
                  beamQuality: { select: { id: true, name: true } },
                },
              },
              productionQuality: { select: { id: true, name: true } },
              millOutvert: {
                select: { id: true, firmChallanNo: true, outvertDate: true },
              },
              millInvert: {
                select: { id: true, millChallanNo: true, invertDate: true },
              },
              taka: { select: { id: true } },
            },
            orderBy: { takaSrNo: "asc" },
          },
        },
      }),
    ]);

    const data = outverts.map((outvert) => {
      const latestInvert = outvert.millInverts[0] ?? null;

      return {
        firmChallanNo: outvert.firmChallanNo,
        firm: outvert.firm,
        mill: outvert.mill,
        millOutvertId: outvert.id,
        outvertDate: outvert.outvertDate,
        invertDate: latestInvert?.invertDate ?? null,
        millChallanNo: latestInvert?.millChallanNo ?? null,
        millInvertId: latestInvert?.id ?? null,
        status: latestInvert !== null ? ("returned" as const) : ("sent" as const),
        productions: outvert.productionInfos,
        takaCount: outvert.productionInfos.length,
      };
    });

    res.json({
      success: true,
      data,
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
