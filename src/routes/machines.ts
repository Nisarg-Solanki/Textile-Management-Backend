import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permission";
import {
  createMachineSchema,
  updateMachineSchema,
} from "../schemas/machine.schema";

const router = Router();

/**
 * @openapi
 * /api/v1/machines:
 *   get:
 *     summary: List machines
 *     tags: [Machines]
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
 *         description: Paginated list of machines
 *       403:
 *         description: Forbidden
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("machines", "view"),
  async (req: Request, res: Response) => {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const firmId = req.query.firmId as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where: Prisma.MachineWhereInput = {
      deletedAt: null,
      ...(firmId && { firmId }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { machineNo: { contains: search, mode: "insensitive" as const } },
          { machineType: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, data] = await Promise.all([
      prisma.machine.count({ where }),
      prisma.machine.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          machineNo: true,
          machineType: true,
          status: true,
          remark: true,
          firm: { select: { firmName: true } },
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
 * /api/v1/machines/{id}:
 *   get:
 *     summary: Get a single machine
 *     tags: [Machines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Machine record
 *       404:
 *         description: Not found
 */
router.get(
  "/:id",
  authMiddleware,
  requirePermission("machines", "view"),
  async (req: Request, res: Response) => {
    const machine = await prisma.machine.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: {
        id: true,
        firmId: true,
        machineNo: true,
        machineType: true,
        remark: true,
        status: true,
        firm: { select: { firmName: true } },
      },
    });
    if (!machine)
      throw new AppError(404, "Machine not found", "MACHINE_NOT_FOUND");

    res.json({ success: true, data: machine });
  },
);

/**
 * @openapi
 * /api/v1/machines:
 *   post:
 *     summary: Create a machine
 *     tags: [Machines]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firmId, machineNo]
 *             properties:
 *               firmId: { type: string }
 *               machineNo: { type: string }
 *               machineType: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *               remark: { type: string }
 *     responses:
 *       201:
 *         description: Machine created
 *       404:
 *         description: Firm not found
 *       409:
 *         description: Duplicate machine number in this firm
 */
router.post(
  "/",
  authMiddleware,
  requirePermission("machines", "create"),
  async (req: Request, res: Response) => {
    const { firmId, machineNo, machineType, status, remark } =
      createMachineSchema.parse(req.body);

    const firm = await prisma.firm.findUnique({
      where: { id: firmId, deletedAt: null },
    });
    if (!firm) throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");

    const duplicate = await prisma.machine.findFirst({
      where: { firmId, machineNo, deletedAt: null },
    });
    if (duplicate)
      throw new AppError(
        409,
        "Machine number already exists in this firm",
        "MACHINE_NO_DUPLICATE",
      );

    const machine = await prisma.machine.create({
      data: { firmId, machineNo, machineType, status, remark },
      include: { firm: { select: { id: true, firmName: true, firmCode: true } } },
    });

    res
      .status(201)
      .json({ success: true, data: machine, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/machines/{id}:
 *   put:
 *     summary: Update a machine
 *     tags: [Machines]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated machine
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate machine number in this firm
 */
router.put(
  "/:id",
  authMiddleware,
  requirePermission("machines", "edit"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const data = updateMachineSchema.parse(req.body);

    const existing = await prisma.machine.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(404, "Machine not found", "MACHINE_NOT_FOUND");

    if (data.machineNo && data.machineNo !== existing.machineNo) {
      const firmId = data.firmId ?? existing.firmId;
      const duplicate = await prisma.machine.findFirst({
        where: { firmId, machineNo: data.machineNo, deletedAt: null, NOT: { id } },
      });
      if (duplicate)
        throw new AppError(
          409,
          "Machine number already exists in this firm",
          "MACHINE_NO_DUPLICATE",
        );
    }

    const machine = await prisma.machine.update({
      where: { id },
      data,
      include: { firm: { select: { id: true, firmName: true, firmCode: true } } },
    });

    res.json({ success: true, data: machine });
  },
);

/**
 * @openapi
 * /api/v1/machines/{id}:
 *   delete:
 *     summary: Soft delete a machine
 *     tags: [Machines]
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
 *         description: Machine has linked production records
 *       404:
 *         description: Not found
 */
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("machines", "delete"),
  async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const existing = await prisma.machine.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing)
      throw new AppError(404, "Machine not found", "MACHINE_NOT_FOUND");

    const linked = await prisma.productionInfo.count({
      where: { machineId: id, deletedAt: null },
    });
    if (linked > 0)
      throw new AppError(
        400,
        "Cannot delete machine with production records",
        "MACHINE_IN_USE",
      );

    await prisma.machine.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: "Deleted successfully" });
  },
);

export default router;
