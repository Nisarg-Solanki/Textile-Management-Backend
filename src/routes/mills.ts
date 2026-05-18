import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { createMillSchema, updateMillSchema } from "../schemas/mill.schema";

const router = Router();

function assertSuperAdmin(req: Request): void {
  if (req.user?.role !== "super_admin")
    throw new AppError(403, "Super admin only", "FORBIDDEN");
}

/**
 * @openapi
 * /api/v1/mills:
 *   get:
 *     summary: List all mills
 *     tags: [Mills]
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
 *         description: Paginated list of mills
 *       403:
 *         description: Super admin only
 */
router.get("/", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const search = req.query.search as string | undefined;
  const status = req.query.status as string | undefined;
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
  );
  const skip = (page - 1) * limit;

  const where: Prisma.MillWhereInput = {
    deletedAt: null,
    ...(status && { status }),
    ...(search && {
      OR: [
        { millName: { contains: search, mode: "insensitive" as const } },
        { millCode: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [total, data] = await Promise.all([
    prisma.mill.count({ where }),
    prisma.mill.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" } }),
  ]);

  res.json({
    success: true,
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * @openapi
 * /api/v1/mills:
 *   post:
 *     summary: Create a mill
 *     tags: [Mills]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [millName]
 *             properties:
 *               millName: { type: string }
 *               millCode: { type: string }
 *               address: { type: string }
 *               contactPerson: { type: string }
 *               contactNumber: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201:
 *         description: Mill created
 *       409:
 *         description: Duplicate mill name
 */
router.post("/", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const data = createMillSchema.parse(req.body);

  const nameConflict = await prisma.mill.findFirst({
    where: { millName: data.millName, deletedAt: null },
  });
  if (nameConflict)
    throw new AppError(409, "Mill name already exists", "MILL_NAME_DUPLICATE");

  const mill = await prisma.mill.create({ data });

  res.status(201).json({ success: true, data: mill, message: "Created successfully" });
});

/**
 * @openapi
 * /api/v1/mills/{id}:
 *   get:
 *     summary: Get a single mill
 *     tags: [Mills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Mill record
 *       404:
 *         description: Not found
 */
router.get("/:id", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const mill = await prisma.mill.findFirst({
    where: { id: req.params.id as string, deletedAt: null },
  });
  if (!mill) throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");

  res.json({ success: true, data: mill });
});

/**
 * @openapi
 * /api/v1/mills/{id}:
 *   put:
 *     summary: Update a mill
 *     tags: [Mills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated mill
 *       404:
 *         description: Not found
 */
router.put("/:id", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const id = req.params.id as string;
  const data = updateMillSchema.parse(req.body);

  const existing = await prisma.mill.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");

  const mill = await prisma.mill.update({ where: { id }, data });

  res.json({ success: true, data: mill });
});

/**
 * @openapi
 * /api/v1/mills/{id}:
 *   delete:
 *     summary: Soft delete a mill
 *     tags: [Mills]
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
 *         description: Mill has active linked records
 *       404:
 *         description: Not found
 */
router.delete("/:id", authMiddleware, async (req: Request, res: Response) => {
  assertSuperAdmin(req);

  const id = req.params.id as string;

  const existing = await prisma.mill.findFirst({ where: { id, deletedAt: null } });
  if (!existing) throw new AppError(404, "Mill not found", "MILL_NOT_FOUND");

  const [outverts, inverts] = await Promise.all([
    prisma.millOutvert.count({ where: { millId: id, deletedAt: null } }),
    prisma.millInvert.count({ where: { millId: id, deletedAt: null } }),
  ]);

  if (outverts > 0 || inverts > 0)
    throw new AppError(400, "Cannot delete mill with active records", "MILL_IN_USE");

  await prisma.mill.update({ where: { id }, data: { deletedAt: new Date() } });

  res.json({ success: true, message: "Deleted successfully" });
});

export default router;
