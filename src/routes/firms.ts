import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { createFirmSchema, updateFirmSchema } from "../schemas/firm.schema";

const router = Router();

function assertSuperAdmin(req: Request): void {
  if (req.user?.role !== "super_admin")
    throw new AppError(403, "Super admin only", "FORBIDDEN");
}

/**
 * @openapi
 * /api/v1/firms:
 *   get:
 *     summary: List all firms
 *     tags: [Firms]
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
 *         description: Paginated list of firms
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {

  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
  );
  const skip = (page - 1) * limit;

  const where: Prisma.FirmWhereInput = {
    deletedAt: null,
    ...(status && { status }),
    ...(search && {
      OR: [
        { firmName: { contains: search, mode: "insensitive" as const } },
        { firmCode: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, data] = await Promise.all([
    prisma.firm.count({ where }),
    prisma.firm.findMany({
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
});

/**
 * @openapi
 * /api/v1/firms:
 *   post:
 *     summary: Create a firm
 *     tags: [Firms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [firmName, firmCode]
 *             properties:
 *               firmName: { type: string }
 *               firmCode: { type: string }
 *               challanEnable: { type: boolean }
 *               srNoSeries: { type: string }
 *               address: { type: string }
 *               contactPerson: { type: string }
 *               contactNumber: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201:
 *         description: Firm created
 *       409:
 *         description: Duplicate firm name or code
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const data = createFirmSchema.parse(req.body);

  const nameConflict = await prisma.firm.findFirst({
    where: { firmName: data.firmName, deletedAt: null },
  });
  if (nameConflict)
    throw new AppError(409, "Firm name already exists", "FIRM_NAME_DUPLICATE");

  const codeConflict = await prisma.firm.findFirst({
    where: { firmCode: data.firmCode, deletedAt: null },
  });
  if (codeConflict)
    throw new AppError(409, "Firm code already exists", "FIRM_CODE_DUPLICATE");

  const firm = await prisma.firm.create({ data });

  res
    .status(201)
    .json({ success: true, data: firm, message: "Created successfully" });
});

/**
 * @openapi
 * /api/v1/firms/{id}:
 *   get:
 *     summary: Get a single firm
 *     tags: [Firms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Firm record
 *       404:
 *         description: Not found
 */
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  
  const firm = await prisma.firm.findFirst({
    where: { id: req.params.id as string, deletedAt: null },
  });
  if (!firm) throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");

  res.json({ success: true, data: firm });
});

/**
 * @openapi
 * /api/v1/firms/{id}:
 *   put:
 *     summary: Update a firm
 *     tags: [Firms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated firm
 *       404:
 *         description: Not found
 */
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const id = req.params.id as string;
  const data = updateFirmSchema.parse(req.body);

  const existing = await prisma.firm.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");

  const firm = await prisma.firm.update({ where: { id }, data });

  res.json({ success: true, data: firm });
});

/**
 * @openapi
 * /api/v1/firms/{id}:
 *   delete:
 *     summary: Soft delete a firm
 *     tags: [Firms]
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
 *         description: Firm has active linked data
 *       404:
 *         description: Not found
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const id = req.params.id as string;

  const existing = await prisma.firm.findFirst({
    where: { id, deletedAt: null },
  });
  if (!existing) throw new AppError(404, "Firm not found", "FIRM_NOT_FOUND");

  const [machines, beams, productions] = await Promise.all([
    prisma.machine.count({ where: { firmId: id, deletedAt: null } }),
    prisma.beam.count({ where: { firmId: id, deletedAt: null } }),
    prisma.productionInfo.count({ where: { firmId: id, deletedAt: null } }),
  ]);

  if (machines > 0 || beams > 0 || productions > 0)
    throw new AppError(
      400,
      "Cannot delete firm with active data",
      "FIRM_IN_USE",
    );

  await prisma.firm.update({ where: { id }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Deleted successfully" });
});

export default router;
