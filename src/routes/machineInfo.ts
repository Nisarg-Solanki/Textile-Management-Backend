import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";

const router = Router();

/**
 * @openapi
 * /api/v1/machine-info:
 *   get:
 *     summary: Latest production entry per machine (auto-generated view)
 *     tags: [MachineInfo]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
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
 *         description: Paginated list — one row per machine showing its latest production state
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("machine_info", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );

    // Fetch the latest ProductionInfo per machine using distinct on machineId
    const latestEntries = await prisma.productionInfo.findMany({
      where: {
        deletedAt: null,
        ...(firmId && { firmId }),
      },
      orderBy: { createdAt: "desc" },
      distinct: ["machineId"],
      include: {
        machine: {
          select: {
            id: true,
            machineNo: true,
            firm: { select: { id: true, firmName: true, firmCode: true } },
          },
        },
        beam: { select: { id: true, beamNo: true } },
      },
    });

    // Apply search filter in-memory (machine.machineNo is a relation field)
    const filtered = search
      ? latestEntries.filter((entry) =>
          entry.machine.machineNo
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
      : latestEntries;

    // Paginate the filtered result
    const total = filtered.length;
    const skip = (page - 1) * limit;
    const paginated = filtered.slice(skip, skip + limit);

    const data = paginated.map((entry) => ({
      id: entry.id,
      machine: entry.machine,
      beam: entry.beam,
      takaSrNo: entry.takaSrNo,
      takaMeter: entry.takaMeter,
      entryDate: entry.entryDate,
    }));

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
