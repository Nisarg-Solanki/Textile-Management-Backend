import request from "supertest";
import app from "../app";

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────

jest.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    passwordResetToken: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("../lib/jwt", () => ({
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
  signAccessToken: jest.fn().mockReturnValue("mock-access-token"),
  signRefreshToken: jest.fn().mockReturnValue("mock-refresh-token"),
}));

jest.mock("../lib/mailer", () => ({
  sendApprovalRequestEmail: jest.fn(),
  sendAccountApprovedEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("../lib/superAdmin", () => ({
  isSuperAdminEmail: jest.fn().mockReturnValue(false),
  getSuperAdminEmails: jest.fn().mockReturnValue([]),
}));

jest.mock("bcryptjs", () => ({
  hash: jest.fn().mockResolvedValue("$2a$12$hashed"),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock(
  "express-rate-limit",
  () => () => (_req: unknown, _res: unknown, next: () => void) => next(),
);

// ─── Imports after mocks ─────────────────────────────────────────────────────

import { prisma } from "../lib/prisma";
import { verifyAccessToken, verifyRefreshToken } from "../lib/jwt";
import { isSuperAdminEmail } from "../lib/superAdmin";
import bcryptjs from "bcryptjs";

const db = prisma as unknown as Record<
  string,
  Record<string, jest.Mock> & { $transaction?: jest.Mock }
> & { $transaction: jest.Mock };
const mockVerify = verifyAccessToken as jest.Mock;
const mockVerifyRefresh = verifyRefreshToken as jest.Mock;
const mockIsSuperAdmin = isSuperAdminEmail as jest.Mock;
const mockBcrypt = bcryptjs as unknown as Record<string, jest.Mock>;

const SUPER_ADMIN_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const ADMIN_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const SUPER_TOKEN = "Bearer mock-super-token";

const superAdminUser = {
  id: SUPER_ADMIN_ID,
  name: "Super Admin",
  email: "superadmin@textile.test",
  passwordHash: "$2a$12$hashed",
  role: "super_admin",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  lastLoginAt: null,
};

const pendingUser = {
  id: ADMIN_ID,
  name: "Regular Admin",
  email: "admin@textile.test",
  passwordHash: "$2a$12$hashed",
  role: "admin",
  status: "pending",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  lastLoginAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({
    userId: SUPER_ADMIN_ID,
    role: "super_admin",
    email: "superadmin@textile.test",
  });
  db.$transaction.mockImplementation(
    async (cb: (tx: typeof db) => Promise<unknown>) => cb(db),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/register
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/register", () => {
  it("201 — registers admin as pending when super_admin already exists", async () => {
    mockIsSuperAdmin.mockReturnValue(false);
    db.user.findFirst
      .mockResolvedValueOnce(null) // no duplicate email
      .mockResolvedValueOnce(superAdminUser); // super_admin already exists → not first setup
    db.user.create.mockResolvedValue({ id: ADMIN_ID });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Regular Admin",
        email: "admin@textile.test",
        password: "AdminPass123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/awaiting/i);
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "admin", status: "pending" }),
      }),
    );
  });

  it("201 — first-time setup auto-approves as super_admin", async () => {
    mockIsSuperAdmin.mockReturnValue(false);
    db.user.findFirst
      .mockResolvedValueOnce(null) // no duplicate
      .mockResolvedValueOnce(null); // no existing super_admin → first setup
    db.user.create.mockResolvedValue({ id: SUPER_ADMIN_ID });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Super Admin",
        email: "first@example.com",
        password: "SuperPass123!",
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/Account created/);
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "super_admin",
          status: "active",
        }),
      }),
    );
  });

  it("201 — super admin email auto-approves as super_admin", async () => {
    mockIsSuperAdmin.mockReturnValue(true);
    db.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(superAdminUser);
    db.user.create.mockResolvedValue({ id: SUPER_ADMIN_ID });

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Super Admin",
        email: "superadmin@textile.test",
        password: "SuperPass123!",
      });

    expect(res.status).toBe(201);
    expect(db.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: "super_admin",
          status: "active",
        }),
      }),
    );
  });

  it("409 — duplicate email returns EMAIL_TAKEN", async () => {
    db.user.findFirst.mockResolvedValueOnce(superAdminUser);

    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Duplicate",
        email: "superadmin@textile.test",
        password: "SuperPass123!",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("400 — missing name fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ email: "test@example.com", password: "Pass123!" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("400 — invalid email format fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Test", email: "not-an-email", password: "Pass123!" });

    expect(res.status).toBe(400);
  });

  it("400 — missing password fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/register")
      .send({ name: "Test", email: "test@example.com" });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/login
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/login", () => {
  it("200 — returns access token with valid credentials", async () => {
    db.user.findFirst.mockResolvedValue(superAdminUser);
    mockBcrypt.compare.mockResolvedValue(true);
    db.user.update.mockResolvedValue(superAdminUser);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin@textile.test", password: "SuperPass123!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe("mock-access-token");
    expect(res.body.data.user.role).toBe("super_admin");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it("401 — user not found returns INVALID_CREDENTIALS", async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@example.com", password: "Pass123!" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("401 — wrong password returns INVALID_CREDENTIALS", async () => {
    db.user.findFirst.mockResolvedValue(superAdminUser);
    mockBcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin@textile.test", password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("403 — pending user cannot log in", async () => {
    db.user.findFirst.mockResolvedValue(pendingUser);

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@textile.test", password: "AdminPass123!" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("PENDING_APPROVAL");
  });

  it("403 — inactive user cannot log in", async () => {
    db.user.findFirst.mockResolvedValue({
      ...superAdminUser,
      status: "inactive",
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "superadmin@textile.test", password: "SuperPass123!" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("ACCOUNT_INACTIVE");
  });

  it("400 — missing email fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ password: "Pass123!" });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/refresh
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/refresh", () => {
  it("200 — returns new access token with valid cookie", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: SUPER_ADMIN_ID });
    db.user.findFirst.mockResolvedValue(superAdminUser);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", "refreshToken=valid-refresh-token");

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe("mock-access-token");
  });

  it("401 — missing cookie returns NO_REFRESH_TOKEN", async () => {
    const res = await request(app).post("/api/v1/auth/refresh");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NO_REFRESH_TOKEN");
  });

  it("401 — user not found or inactive after token verify", async () => {
    mockVerifyRefresh.mockReturnValue({ userId: SUPER_ADMIN_ID });
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", "refreshToken=valid-token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/logout
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/logout", () => {
  it("200 — always succeeds and clears cookie", async () => {
    const res = await request(app).post("/api/v1/auth/logout");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/logged out/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/forgot-password
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/forgot-password", () => {
  it("200 — always responds 200 regardless of whether email exists (privacy)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reset link/i);
  });

  it("200 — valid email also returns 200 (same response)", async () => {
    db.user.findFirst.mockResolvedValue(superAdminUser);
    db.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
    db.passwordResetToken.create.mockResolvedValue({});

    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "superadmin@textile.test" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("400 — missing email fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/forgot-password")
      .send({});

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/reset-password
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/reset-password", () => {
  const validToken =
    "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";

  it("200 — valid token resets password", async () => {
    const tokenRecord = {
      id: "token-id",
      userId: SUPER_ADMIN_ID,
      token: "$2a$12$hashed-token",
      expiresAt: new Date(Date.now() + 3600000),
      usedAt: null,
      user: superAdminUser,
    };
    db.passwordResetToken.findMany.mockResolvedValue([tokenRecord]);
    mockBcrypt.compare.mockResolvedValue(true);
    db.user.update.mockResolvedValue(superAdminUser);
    db.passwordResetToken.update.mockResolvedValue(tokenRecord);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: validToken, password: "NewPass123!" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/reset successfully/i);
  });

  it("400 — no valid token found returns INVALID_RESET_TOKEN", async () => {
    db.passwordResetToken.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: validToken, password: "NewPass123!" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RESET_TOKEN");
  });

  it("400 — token compare fails returns INVALID_RESET_TOKEN", async () => {
    db.passwordResetToken.findMany.mockResolvedValue([
      {
        id: "token-id",
        userId: SUPER_ADMIN_ID,
        token: "$2a$12$hashed",
        expiresAt: new Date(Date.now() + 3600000),
        usedAt: null,
        user: superAdminUser,
      },
    ]);
    mockBcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ token: validToken, password: "NewPass123!" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_RESET_TOKEN");
  });

  it("400 — missing token fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/reset-password")
      .send({ password: "NewPass123!" });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/users  (super_admin only)
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/users", () => {
  const newUser = {
    id: ADMIN_ID,
    name: "New Admin",
    email: "newadmin@test.com",
    role: "admin",
    status: "active",
    createdAt: new Date(),
  };

  it("201 — super_admin creates an active admin user", async () => {
    db.user.findFirst.mockResolvedValue(null);
    db.user.create.mockResolvedValue(newUser);

    const res = await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", SUPER_TOKEN)
      .send({
        name: "New Admin",
        email: "newadmin@test.com",
        password: "Admin@1234",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe("admin");
    expect(res.body.data.status).toBe("active");
    expect(res.body.data.passwordHash).toBeUndefined();
  });

  it("401 — no auth header returns 401", async () => {
    const res = await request(app)
      .post("/api/v1/auth/users")
      .send({ name: "Test", email: "test@test.com", password: "Test@1234" });

    expect(res.status).toBe(401);
  });

  it("403 — admin role returns FORBIDDEN", async () => {
    mockVerify.mockReturnValue({
      userId: ADMIN_ID,
      role: "admin",
      email: "admin@test.com",
    });

    const res = await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", "Bearer mock-admin-token")
      .send({ name: "Test", email: "test2@test.com", password: "Test@1234" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("409 — duplicate email returns EMAIL_TAKEN", async () => {
    db.user.findFirst.mockResolvedValue(superAdminUser);

    const res = await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", SUPER_TOKEN)
      .send({
        name: "Dup",
        email: "superadmin@textile.test",
        password: "Pass@1234",
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");
  });

  it("400 — missing required fields fails validation", async () => {
    const res = await request(app)
      .post("/api/v1/auth/users")
      .set("Authorization", SUPER_TOKEN)
      .send({ email: "test@test.com" });

    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/auth/pending-users  (super_admin only)
// ═══════════════════════════════════════════════════════════════════════════

describe("GET /api/v1/auth/pending-users", () => {
  it("200 — returns paginated pending users", async () => {
    db.user.count.mockResolvedValue(1);
    db.user.findMany.mockResolvedValue([pendingUser]);

    const res = await request(app)
      .get("/api/v1/auth/pending-users")
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].status).toBe("pending");
  });

  it("200 — search filter narrows results", async () => {
    db.user.count.mockResolvedValue(0);
    db.user.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/api/v1/auth/pending-users?search=nobody")
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it("200 — pagination params are respected", async () => {
    db.user.count.mockResolvedValue(50);
    db.user.findMany.mockResolvedValue([pendingUser]);

    const res = await request(app)
      .get("/api/v1/auth/pending-users?page=2&limit=10")
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.pagination.totalPages).toBe(5);
  });

  it("401 — no auth returns 401", async () => {
    const res = await request(app).get("/api/v1/auth/pending-users");
    expect(res.status).toBe(401);
  });

  it("403 — admin role returns FORBIDDEN", async () => {
    mockVerify.mockReturnValue({
      userId: ADMIN_ID,
      role: "admin",
      email: "admin@test.com",
    });

    const res = await request(app)
      .get("/api/v1/auth/pending-users")
      .set("Authorization", "Bearer mock-admin-token");

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/approve-user/:id  (super_admin only)
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/approve-user/:id", () => {
  it("200 — approves a pending user", async () => {
    db.user.findFirst.mockResolvedValue(pendingUser);
    db.user.update.mockResolvedValue({ ...pendingUser, status: "active" });

    const res = await request(app)
      .post(`/api/v1/auth/approve-user/${ADMIN_ID}`)
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active" } }),
    );
  });

  it("404 — non-existent pending user returns USER_NOT_FOUND", async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/approve-user/non-existent-id")
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });

  it("401 — no auth returns 401", async () => {
    const res = await request(app).post(
      `/api/v1/auth/approve-user/${ADMIN_ID}`,
    );
    expect(res.status).toBe(401);
  });

  it("403 — admin role returns FORBIDDEN", async () => {
    mockVerify.mockReturnValue({
      userId: ADMIN_ID,
      role: "admin",
      email: "admin@test.com",
    });

    const res = await request(app)
      .post(`/api/v1/auth/approve-user/${ADMIN_ID}`)
      .set("Authorization", "Bearer mock-admin-token");

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/auth/reject-user/:id  (super_admin only)
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /api/v1/auth/reject-user/:id", () => {
  it("200 — soft-deletes a pending user", async () => {
    db.user.findFirst.mockResolvedValue(pendingUser);
    db.user.update.mockResolvedValue({ ...pendingUser, deletedAt: new Date() });

    const res = await request(app)
      .post(`/api/v1/auth/reject-user/${ADMIN_ID}`)
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });

  it("404 — non-existent user returns USER_NOT_FOUND", async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post("/api/v1/auth/reject-user/ghost-id")
      .set("Authorization", SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("USER_NOT_FOUND");
  });

  it("401 — no auth returns 401", async () => {
    const res = await request(app).post(`/api/v1/auth/reject-user/${ADMIN_ID}`);
    expect(res.status).toBe(401);
  });

  it("403 — admin role returns FORBIDDEN", async () => {
    mockVerify.mockReturnValue({
      userId: ADMIN_ID,
      role: "admin",
      email: "admin@test.com",
    });

    const res = await request(app)
      .post(`/api/v1/auth/reject-user/${ADMIN_ID}`)
      .set("Authorization", "Bearer mock-admin-token");

    expect(res.status).toBe(403);
  });
});
