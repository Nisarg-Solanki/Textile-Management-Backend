import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";

const router = Router();

/**
 * @openapi
 * /api/v1/machine-info:
 *   get:
 *     summary: All machines with nested beams and takas
 *     tags: [MachineInfo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Case-insensitive contains search across machineNo and machineType
 *       - in: query
 *         name: machine_no
 *         schema: { type: string }
 *         description: Filter by machine number (case-insensitive contains)
 *       - in: query
 *         name: firmId
 *         schema: { type: string }
 *         description: Filter by firm
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated list of machines, each with their beams and takas
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("machine_info", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const machineNo = req.query.machine_no as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(search && {
        OR: [
          { machineNo: { contains: search, mode: "insensitive" as const } },
          { machineType: { contains: search, mode: "insensitive" as const } },
        ],
      }),
      ...(machineNo && {
        machineNo: { contains: machineNo, mode: "insensitive" as const },
      }),
    };

    const [total, machines] = await Promise.all([
      prisma.machine.count({ where }),
      prisma.machine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { machineNo: "asc" },
        select: {
          id: true,
          firmId: true,
          machineNo: true,
          machineType: true,
          status: true,
          remark: true,
          createdAt: true,
          updatedAt: true,
          firm: { select: { id: true, firmName: true, firmCode: true } },
          productionInfos: {
            where: { deletedAt: null },
            orderBy: { entryDate: "desc" },
            select: {
              beamId: true,
              takaNo: true,
              beam: {
                select: {
                  id: true,
                  beamNo: true,
                  beamMeter: true,
                },
              },
              taka: { select: { id: true, takaSrNo: true, takaMeter: true } },
            },
          },
        },
      }),
    ]);

    type ProdEntry = (typeof machines)[number]["productionInfos"][number];
    type TakaEntry = NonNullable<ProdEntry["taka"]> & { takaNo: string | null };
    type BeamEntry = ProdEntry["beam"] & { takas: TakaEntry[] };

    const data = machines.map((machine) => {
      const { productionInfos, ...machineFields } = machine;

      const beamMap = new Map<string, BeamEntry>();

      for (const prod of productionInfos) {
        if (!beamMap.has(prod.beamId)) {
          beamMap.set(prod.beamId, { ...prod.beam, takas: [] });
        }
        if (prod.taka) {
          beamMap.get(prod.beamId)!.takas.push({ ...prod.taka, takaNo: prod.takaNo });
        }
      }

      return {
        ...machineFields,
        beams: Array.from(beamMap.values()),
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
