import { Router, Request, Response } from "express";
import crypto from "node:crypto";
import bcryptjs from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";
import { isSuperAdminEmail } from "../lib/superAdmin";
import {
  sendApprovalRequestEmail,
  sendAccountApprovedEmail,
  sendPasswordResetEmail,
} from "../lib/mailer";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  createUserByAdminSchema,
} from "../schemas/auth.schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();

const REFRESH_COOKIE = "refreshToken";
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: Registration submitted or account created
 *       409:
 *         description: Email already in use
 */
router.post("/register", async (req: Request, res: Response) => {
  const { name, email, password } = registerSchema.parse(req.body);

  const existing = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });
  if (existing) throw new AppError(409, "Email already in use", "EMAIL_TAKEN");

  const isSuperEmail = isSuperAdminEmail(email);
  const existingSuperAdmin = await prisma.user.findFirst({
    where: { role: "super_admin", deletedAt: null },
  });
  const isFirstSetup = !existingSuperAdmin;

  const role = isSuperEmail || isFirstSetup ? "super_admin" : "admin";
  const status = isSuperEmail || isFirstSetup ? "active" : "pending";

  const passwordHash = await bcryptjs.hash(password, 12);

  await prisma.user.create({
    data: { name, email, passwordHash, role, status },
  });

  if (status === "pending") {
    sendApprovalRequestEmail(name, email);
  }

  const message =
    role === "super_admin"
      ? "Account created."
      : "Registration submitted. Awaiting super admin approval.";

  res.status(201).json({ success: true, message });
});

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Login and receive access token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authenticated — access token returned
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account pending or inactive
 */
router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = loginSchema.parse(req.body);

  const user = await prisma.user.findFirst({
    where: { email, deletedAt: null },
  });

  if (!user)
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  if (user.status === "pending")
    throw new AppError(403, "Account pending approval", "PENDING_APPROVAL");
  if (user.status === "inactive")
    throw new AppError(403, "Account is inactive", "ACCOUNT_INACTIVE");

  const passwordMatch = await bcryptjs.compare(password, user.passwordHash);
  if (!passwordMatch)
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  const refreshToken = signRefreshToken({ userId: user.id });

  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  prisma.user
    .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    .catch((err: unknown) => console.error("lastLoginAt update failed:", err));

  res.json({
    success: true,
    data: {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    },
  });
});

/**
 * @openapi
 * /api/v1/auth/refresh:
 *   post:
 *     summary: Refresh access token using httpOnly cookie
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: New access token issued
 *       401:
 *         description: Refresh token missing or invalid
 */
router.post("/refresh", async (req: Request, res: Response) => {
  const token = req.cookies[REFRESH_COOKIE] as string | undefined;
  if (!token)
    throw new AppError(401, "Refresh token missing", "NO_REFRESH_TOKEN");

  const { userId } = verifyRefreshToken(token);

  const user = await prisma.user.findFirst({
    where: { id: userId, status: "active", deletedAt: null },
  });
  if (!user)
    throw new AppError(401, "Invalid or expired token", "INVALID_TOKEN");

  const accessToken = signAccessToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });

  res.json({ success: true, data: { accessToken } });
});

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Logout — clears refresh token cookie
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE);
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset link sent if email exists
 */
router.post("/forgot-password", async (req: Request, res: Response) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  res.json({
    success: true,
    message: "If that email exists, a reset link has been sent.",
  });

  const processReset = async () => {
    const user = await prisma.user.findFirst({
      where: { email, status: "active", deletedAt: null },
    });
    if (!user) return;

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await bcryptjs.hash(rawToken, 12);

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 3600000),
      },
    });

    sendPasswordResetEmail(user.email, rawToken);
  };

  processReset().catch((err: unknown) =>
    console.error("Forgot password processing failed:", err),
  );
});

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset password using a one-time token
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired token
 */
router.post("/reset-password", async (req: Request, res: Response) => {
  const { token: rawToken, password } = resetPasswordSchema.parse(req.body);

  const candidates = await prisma.passwordResetToken.findMany({
    where: { expiresAt: { gt: new Date() }, usedAt: null },
    include: { user: true },
  });

  let matchedCandidate: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    const isMatch = await bcryptjs.compare(rawToken, candidate.token);
    if (isMatch) {
      matchedCandidate = candidate;
      break;
    }
  }

  if (!matchedCandidate) {
    throw new AppError(
      400,
      "Invalid or expired reset token",
      "INVALID_RESET_TOKEN",
    );
  }

  const confirmedMatch = matchedCandidate;
  const passwordHash = await bcryptjs.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: confirmedMatch.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: confirmedMatch.id },
      data: { usedAt: new Date() },
    });
  });

  res.json({
    success: true,
    message: "Password reset successfully. Please log in.",
  });
});

function assertSuperAdmin(req: Request): void {
  if (req.user?.role !== "super_admin")
    throw new AppError(403, "Super admin only", "FORBIDDEN");
}

/**
 * @openapi
 * /api/v1/auth/users:
 *   post:
 *     summary: Create a user directly (super_admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created with status active
 *       403:
 *         description: Super admin only
 *       409:
 *         description: Email already in use
 */
router.post(
  "/users",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const { name, email, password } = createUserByAdminSchema.parse(req.body);

    const existing = await prisma.user.findFirst({
      where: { email, deletedAt: null },
    });
    if (existing)
      throw new AppError(409, "Email already in use", "EMAIL_TAKEN");

    const passwordHash = await bcryptjs.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: "admin", status: "active" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json({ success: true, data: user, message: "Created successfully" });
  },
);

/**
 * @openapi
 * /api/v1/auth/pending-users:
 *   get:
 *     summary: List all pending users (super_admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Paginated list of pending users
 *       403:
 *         description: Super admin only
 */
router.get(
  "/pending-users",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const search = req.query.search as string | undefined;
    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt((req.query.limit as string) ?? "20", 10)),
    );
    const skip = (page - 1) * limit;

    const where = {
      status: "pending" as const,
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);

/**
 * @openapi
 * /api/v1/auth/approve-user/{id}:
 *   post:
 *     summary: Approve a pending user (super_admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User approved
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Pending user not found
 */
router.post(
  "/approve-user/:id",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const id = req.params.id as string;

    const user = await prisma.user.findFirst({
      where: { id, status: "pending", deletedAt: null },
    });
    if (!user)
      throw new AppError(404, "Pending user not found", "USER_NOT_FOUND");

    await prisma.user.update({
      where: { id },
      data: { status: "active" },
    });

    sendAccountApprovedEmail(user.email, user.name);

    res.json({
      success: true,
      message:
        "User approved. Assign permissions via PUT /api/v1/permissions/:adminId",
    });
  },
);

/**
 * @openapi
 * /api/v1/auth/reject-user/{id}:
 *   post:
 *     summary: Reject a pending user (super_admin only)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User rejected and removed
 *       403:
 *         description: Super admin only
 *       404:
 *         description: Pending user not found
 */
router.post(
  "/reject-user/:id",
  authMiddleware,
  async (req: Request, res: Response) => {
    assertSuperAdmin(req);

    const id = req.params.id as string;

    const user = await prisma.user.findFirst({
      where: { id, status: "pending", deletedAt: null },
    });
    if (!user)
      throw new AppError(404, "Pending user not found", "USER_NOT_FOUND");

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: "User rejected and removed" });
  },
);

export default router;
