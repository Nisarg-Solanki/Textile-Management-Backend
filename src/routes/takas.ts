import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";

const router = Router();

/**
 * @openapi
 * /api/v1/takas:
 *   get:
 *     summary: List takas (read-only, auto-generated from production)
 *     tags: [Takas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by takaSrNo
 *       - in: query
 *         name: beam_no
 *         schema: { type: string }
 *         description: Filter by beam number
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [not_sent, at_mill, returned]
 *         description: Filter by mill dispatch status
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of takas
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("takas", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const beamNo = req.query.beam_no as string | undefined;
    const meterMin = req.query.meter_min as string | undefined;
    const meterMax = req.query.meter_max as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const status = req.query.status as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const validStatuses = ["not_sent", "at_mill", "returned"];
    if (status && !validStatuses.includes(status)) {
      throw new AppError(400, "Invalid status value. Must be one of: not_sent, at_mill, returned", "INVALID_STATUS");
    }

    const statusFilter: Prisma.TakaWhereInput =
      status === "not_sent"
        ? { productionInfo: { millOutvertId: null } }
        : status === "at_mill"
          ? { productionInfo: { millOutvertId: { not: null }, millInvertId: null } }
          : status === "returned"
            ? { productionInfo: { millInvertId: { not: null } } }
            : {};

    const where: Prisma.TakaWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(beamNo && {
        beam: { beamNo: { contains: beamNo, mode: "insensitive" as const } },
      }),
      ...((meterMin ?? meterMax) && {
        takaMeter: {
          ...(meterMin && { gte: new Prisma.Decimal(meterMin) }),
          ...(meterMax && { lte: new Prisma.Decimal(meterMax) }),
        },
      }),
      ...(search && {
        OR: [
          { takaSrNo: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...statusFilter,
    };

    const [total, rawList] = await Promise.all([
      prisma.taka.count({ where }),
      prisma.taka.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          takaSrNo: true,
          takaMeter: true,
          createdAt: true,
          firm: { select: { firmName: true } },
          beam: { select: { beamNo: true } },
          productionInfo: {
            select: {
              takaNo: true,
              millOutvertDate: true,
              millInvertDate: true,
              millInvertId: true,
              millInvert: { select: { invertDate: true } },
              millOutvert: { select: { firmChallanNo: true } },
            },
          },
        },
      }),
    ]);

    const data = rawList.map((r) => {
      const { productionInfo, ...rest } = r;
      const { millInvert: linkedInvert, millInvertDate, millOutvert, ...piRest } = productionInfo ?? {
        millInvert: null,
        millInvertDate: null,
        millOutvert: null,
      };
      return {
        ...rest,
        takaNo: productionInfo?.takaNo ?? null,
        productionInfo: productionInfo
          ? {
              ...piRest,
              millInvertDate: millInvertDate ?? linkedInvert?.invertDate ?? null,
              firmChallanNo: millOutvert?.firmChallanNo ?? null,
            }
          : null,
      };
    });

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  },
);

/**
 * @openapi
 * /api/v1/takas/{id}:
 *   get:
 *     summary: Get a single taka with linked production info
 *     tags: [Takas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Taka record with production info
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("takas", "view"),
  async (req: Request, res: Response) => {
    const taka = await prisma.taka.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: {
        id: true,
        takaSrNo: true,
        takaMeter: true,
        createdAt: true,
        firm: { select: { firmName: true } },
        beam: { select: { beamNo: true } },
        productionInfo: {
          select: {
            takaNo: true,
            entryDate: true,
            weight: true,
            millName: true,
            millOutvertDate: true,
            millInvertDate: true,
            millInvertId: true,
            millInvert: { select: { invertDate: true } },
            millOutvert: { select: { firmChallanNo: true } },
            machine: { select: { machineNo: true } },
            productionQuality: { select: { name: true } },
          },
        },
      },
    });

    if (!taka) throw new AppError(404, "Taka not found", "TAKA_NOT_FOUND");

    const pi = taka.productionInfo;
    const { millInvert: linkedInvert, millInvertDate, millOutvert, ...piRest } = pi ?? {
      millInvert: null,
      millInvertDate: null,
      millOutvert: null,
    };

    res.json({
      success: true,
      data: {
        ...taka,
        takaNo: pi?.takaNo ?? null,
        productionInfo: pi
          ? {
              ...piRest,
              millInvertDate: millInvertDate ?? linkedInvert?.invertDate ?? null,
              firmChallanNo: millOutvert?.firmChallanNo ?? null,
            }
          : null,
      },
    });
  },
);

export default router;
