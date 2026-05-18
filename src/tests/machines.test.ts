import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    machine: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    firm: { findUnique: jest.fn() },
    productionInfo: { count: jest.fn() },
    adminPermission: { findUnique: jest.fn() },
  },
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockVerify = verifyAccessToken as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const FIRM_ID = 'cccccccc-0000-0000-0000-000000000003';
const MACHINE_ID = 'eeeeeeee-0000-0000-0000-000000000005';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const firmData = { id: FIRM_ID, firmName: 'Sunrise Textiles', deletedAt: null };

const machineData = {
  id: MACHINE_ID,
  firmId: FIRM_ID,
  machineNo: 'M-001',
  machineType: 'Rapier',
  status: 'active',
  remark: 'Main loom',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  firm: { id: FIRM_ID, firmName: 'Sunrise Textiles' },
};

// Helper to set permission for admin
const grantPermission = (action: string) => {
  const fieldMap: Record<string, string> = { view: 'canView', create: 'canCreate', edit: 'canEdit', delete: 'canDelete' };
  db.adminPermission.findUnique.mockResolvedValue({ [fieldMap[action]]: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/machines
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/machines', () => {
  it('200 — super_admin lists all machines', async () => {
    db.machine.count.mockResolvedValue(1);
    db.machine.findMany.mockResolvedValue([machineData]);

    const res = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list machines', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.machine.count.mockResolvedValue(1);
    db.machine.findMany.mockResolvedValue([machineData]);

    const res = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filters machines by firm', async () => {
    db.machine.count.mockResolvedValue(1);
    db.machine.findMany.mockResolvedValue([machineData]);

    const res = await request(app)
      .get(`/api/v1/machines?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?status=inactive filters by status', async () => {
    db.machine.count.mockResolvedValue(0);
    db.machine.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/machines?status=inactive')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 — ?search=Rapier filters by machineType', async () => {
    db.machine.count.mockResolvedValue(1);
    db.machine.findMany.mockResolvedValue([machineData]);

    const res = await request(app)
      .get('/api/v1/machines?search=Rapier')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/machines')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/machines');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/machines/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/machines/:id', () => {
  it('200 — returns a single machine with firm included', async () => {
    db.machine.findFirst.mockResolvedValue(machineData);

    const res = await request(app)
      .get(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(MACHINE_ID);
    expect(res.body.data.firm).toBeDefined();
  });

  it('404 — not found returns MACHINE_NOT_FOUND', async () => {
    db.machine.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/machines/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MACHINE_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/machines/${MACHINE_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/machines
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/machines', () => {
  const createPayload = {
    firmId: FIRM_ID,
    machineNo: 'M-001',
    machineType: 'Rapier',
    status: 'active',
    remark: 'Main loom',
  };

  it('201 — creates a machine', async () => {
    db.firm.findUnique.mockResolvedValue(firmData);
    db.machine.findFirst.mockResolvedValue(null);
    db.machine.create.mockResolvedValue(machineData);

    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.machineNo).toBe('M-001');
  });

  it('201 — admin with create permission can create machine', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    db.firm.findUnique.mockResolvedValue(firmData);
    db.machine.findFirst.mockResolvedValue(null);
    db.machine.create.mockResolvedValue(machineData);

    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('404 — firm not found returns FIRM_NOT_FOUND', async () => {
    db.firm.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('409 — duplicate machine number in same firm returns MACHINE_NO_DUPLICATE', async () => {
    db.firm.findUnique.mockResolvedValue(firmData);
    db.machine.findFirst.mockResolvedValue(machineData);

    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MACHINE_NO_DUPLICATE');
  });

  it('400 — missing firmId fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN)
      .send({ machineNo: 'M-001' });

    expect(res.status).toBe(400);
  });

  it('400 — missing machineNo fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmId: FIRM_ID });

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/machines')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/machines').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/machines/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/machines/:id', () => {
  it('200 — updates a machine status', async () => {
    db.machine.findFirst.mockResolvedValueOnce(machineData);
    db.machine.update.mockResolvedValue({ ...machineData, status: 'inactive' });

    const res = await request(app)
      .put(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  it('409 — changing to a duplicate machine number returns MACHINE_NO_DUPLICATE', async () => {
    db.machine.findFirst
      .mockResolvedValueOnce(machineData)  // existing machine
      .mockResolvedValueOnce({ id: 'other-id', machineNo: 'M-002' }); // duplicate found

    const res = await request(app)
      .put(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ machineNo: 'M-002' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MACHINE_NO_DUPLICATE');
  });

  it('404 — not found returns MACHINE_NOT_FOUND', async () => {
    db.machine.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/machines/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ status: 'inactive' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MACHINE_NOT_FOUND');
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ status: 'inactive' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/machines/${MACHINE_ID}`).send({ status: 'inactive' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/machines/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/machines/:id', () => {
  it('200 — soft-deletes machine with no production records', async () => {
    db.machine.findFirst.mockResolvedValue(machineData);
    db.productionInfo.count.mockResolvedValue(0);
    db.machine.update.mockResolvedValue({ ...machineData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — machine with production records returns MACHINE_IN_USE', async () => {
    db.machine.findFirst.mockResolvedValue(machineData);
    db.productionInfo.count.mockResolvedValue(5);

    const res = await request(app)
      .delete(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MACHINE_IN_USE');
  });

  it('404 — not found returns MACHINE_NOT_FOUND', async () => {
    db.machine.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/machines/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MACHINE_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/machines/${MACHINE_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/machines/${MACHINE_ID}`);
    expect(res.status).toBe(401);
  });
});
