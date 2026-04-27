import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { authMiddleware } from "../middleware/auth";
import { setPermissionsSchema } from "../schemas/permission.schema";

const router = Router();

function assertSuperAdmin(req: Request): void {
  if (req.user?.role !== "super_admin")
    throw new AppError(403, "Super admin only", "FORBIDDEN");
}

/**
 * @openapi
 * /api/v1/permissions/{adminId}:
 *   get:
 *     summary: Get all module permissions for an admin (super_admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User info and their permissions
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Admin user not found
 */
router.get(
  "/:adminId",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const adminId = req.params.adminId as string;

    const user = await prisma.user.findFirst({
      where: { id: adminId, role: "admin", deletedAt: null },
      select: { id: true, name: true, email: true },
    });
    if (!user)
      throw new AppError(404, "Admin user not found", "USER_NOT_FOUND");

    const permissions = await prisma.adminPermission.findMany({
      where: { userId: adminId },
    });

    res.json({
      success: true,
      data: { user, permissions },
    });
  },
);

/**
 * @openapi
 * /api/v1/permissions/{adminId}:
 *   put:
 *     summary: Set/replace all module permissions for an admin (super_admin only)
 *     tags: [Permissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: adminId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required: [module, canView, canCreate, canEdit, canDelete]
 *               properties:
 *                 module:
 *                   type: string
 *                 canView:
 *                   type: boolean
 *                 canCreate:
 *                   type: boolean
 *                 canEdit:
 *                   type: boolean
 *                 canDelete:
 *                   type: boolean
 *     responses:
 *       200:
 *         description: Permissions replaced successfully
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Admin user not found
 */
router.put(
  "/:adminId",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const adminId = req.params.adminId as string;
    const body = setPermissionsSchema.parse(req.body);

    const user = await prisma.user.findFirst({
      where: { id: adminId, role: "admin", deletedAt: null },
      select: { id: true, name: true, email: true },
    });
    if (!user)
      throw new AppError(404, "Admin user not found", "USER_NOT_FOUND");

    await prisma.$transaction(async (tx) => {
      await tx.adminPermission.deleteMany({ where: { userId: adminId } });
      await tx.adminPermission.createMany({
        data: body.map((p) => ({ userId: adminId, ...p })),
      });
    });

    const permissions = await prisma.adminPermission.findMany({
      where: { userId: adminId },
    });

    res.json({
      success: true,
      data: { user, permissions },
      message: "Permissions updated successfully",
    });
  },
);

export default router;
