import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
    adminPermission: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
const mockVerify = verifyAccessToken as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const adminUser = {
  id: ADMIN_ID,
  name: 'Test Admin',
  email: 'admin@test.com',
};

const existingPermissions = [
  { id: 'perm-1', userId: ADMIN_ID, module: 'beams', canView: true, canCreate: false, canEdit: false, canDelete: false },
  { id: 'perm-2', userId: ADMIN_ID, module: 'machines', canView: true, canCreate: true, canEdit: true, canDelete: false },
];

const newPermissionsPayload = [
  { module: 'beams', canView: true, canCreate: true, canEdit: true, canDelete: false },
  { module: 'production', canView: true, canCreate: false, canEdit: false, canDelete: false },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
  (db as unknown as { $transaction: jest.Mock }).$transaction.mockImplementation(
    async (cb: (tx: typeof db) => Promise<unknown>) => cb(db),
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/permissions/:adminId
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/permissions/:adminId', () => {
  it('200 — super_admin fetches permissions for an admin', async () => {
    db.user.findFirst.mockResolvedValue(adminUser);
    db.adminPermission.findMany.mockResolvedValue(existingPermissions);

    const res = await request(app)
      .get(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.id).toBe(ADMIN_ID);
    expect(res.body.data.user.email).toBe('admin@test.com');
    expect(res.body.data.permissions).toHaveLength(2);
  });

  it('200 — returns empty permissions array when admin has none', async () => {
    db.user.findFirst.mockResolvedValue(adminUser);
    db.adminPermission.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toHaveLength(0);
  });

  it('404 — admin user not found returns USER_NOT_FOUND', async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/permissions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('403 — admin role user is rejected (super_admin only)', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .get(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth token returns 401', async () => {
    const res = await request(app).get(`/api/v1/permissions/${ADMIN_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/permissions/:adminId
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/permissions/:adminId', () => {
  it('200 — super_admin replaces all permissions atomically', async () => {
    db.user.findFirst.mockResolvedValue(adminUser);
    db.adminPermission.deleteMany.mockResolvedValue({ count: 2 });
    db.adminPermission.createMany.mockResolvedValue({ count: 2 });
    db.adminPermission.findMany.mockResolvedValue([
      { id: 'new-1', userId: ADMIN_ID, module: 'beams', canView: true, canCreate: true, canEdit: true, canDelete: false },
      { id: 'new-2', userId: ADMIN_ID, module: 'production', canView: true, canCreate: false, canEdit: false, canDelete: false },
    ]);

    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send(newPermissionsPayload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/updated/i);
    expect(res.body.data.user.id).toBe(ADMIN_ID);
    expect(res.body.data.permissions).toHaveLength(2);
  });

  it('200 — transaction: deleteMany then createMany called', async () => {
    db.user.findFirst.mockResolvedValue(adminUser);
    db.adminPermission.deleteMany.mockResolvedValue({ count: 0 });
    db.adminPermission.createMany.mockResolvedValue({ count: 2 });
    db.adminPermission.findMany.mockResolvedValue([]);

    await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send(newPermissionsPayload);

    expect(db.adminPermission.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ADMIN_ID } }),
    );
    expect(db.adminPermission.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: ADMIN_ID, module: 'beams' }),
        ]),
      }),
    );
  });

  it('200 — can set full permissions for all valid modules', async () => {
    const fullPayload = [
      { module: 'machines', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'beams', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'production', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'takas', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { module: 'mill_outverts', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'mill_inverts', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'machine_info', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { module: 'mill_summary', canView: true, canCreate: false, canEdit: false, canDelete: false },
      { module: 'firms', canView: true, canCreate: true, canEdit: true, canDelete: true },
      { module: 'mills', canView: true, canCreate: true, canEdit: true, canDelete: true },
    ];

    db.user.findFirst.mockResolvedValue(adminUser);
    db.adminPermission.deleteMany.mockResolvedValue({ count: 0 });
    db.adminPermission.createMany.mockResolvedValue({ count: fullPayload.length });
    db.adminPermission.findMany.mockResolvedValue([]);

    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send(fullPayload);

    expect(res.status).toBe(200);
  });

  it('404 — admin user not found returns USER_NOT_FOUND', async () => {
    db.user.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/permissions/00000000-0000-0000-0000-000000000000')
      .set('Authorization', SUPER_TOKEN)
      .send(newPermissionsPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('USER_NOT_FOUND');
  });

  it('400 — empty array body fails schema validation', async () => {
    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send([]);

    expect(res.status).toBe(400);
  });

  it('400 — invalid module name fails schema validation', async () => {
    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send([{ module: 'invalid_module', canView: true, canCreate: false, canEdit: false, canDelete: false }]);

    expect(res.status).toBe(400);
  });

  it('400 — missing canView field fails schema validation', async () => {
    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send([{ module: 'beams', canCreate: false, canEdit: false, canDelete: false }]);

    expect(res.status).toBe(400);
  });

  it('400 — non-array body fails schema validation', async () => {
    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ module: 'beams', canView: true, canCreate: false, canEdit: false, canDelete: false });

    expect(res.status).toBe(400);
  });

  it('403 — admin role user is rejected (super_admin only)', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send(newPermissionsPayload);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth token returns 401', async () => {
    const res = await request(app)
      .put(`/api/v1/permissions/${ADMIN_ID}`)
      .send(newPermissionsPayload);

    expect(res.status).toBe(401);
  });
});
