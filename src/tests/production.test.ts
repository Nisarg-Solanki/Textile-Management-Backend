import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    productionInfo: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    taka: { update: jest.fn() },
    adminPermission: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../services/production.service', () => ({
  createProductionEntry: jest.fn(),
  updateProductionEntry: jest.fn(),
}));

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { createProductionEntry, updateProductionEntry } from '../services/production.service';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
const mockVerify = verifyAccessToken as jest.Mock;
const mockCreate = createProductionEntry as jest.Mock;
const mockUpdate = updateProductionEntry as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const FIRM_ID = 'cccccccc-0000-0000-0000-000000000003';
const MACHINE_ID = 'eeeeeeee-0000-0000-0000-000000000005';
const BEAM_ID = 'ffffffff-0000-0000-0000-000000000006';
const PRODUCTION_ID = '11111111-0000-0000-0000-000000000007';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const productionData = {
  id: PRODUCTION_ID,
  firmId: FIRM_ID,
  machineId: MACHINE_ID,
  beamId: BEAM_ID,
  entryDate: new Date('2024-01-15T10:00:00.000Z'),
  takaSrNo: 'T-001',
  takaMeter: '25.50',
  productionQuality: 'Premium',
  weight: '12.75',
  productionChallanNo: 'PC-001',
  remark: 'First entry',
  millOutvertId: null,
  millInvertId: null,
  millOutvertDate: null,
  millChallanNo: null,
  millName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  machine: { id: MACHINE_ID, machineNo: 'M-101', machineType: 'Rapier' },
  beam: { id: BEAM_ID, beamNo: 'B-001', beamQuality: 'Premium', beamMeter: '1200.00' },
  taka: { id: 'taka-id', takaSrNo: 'T-001', takaMeter: '25.50', createdAt: new Date() },
  millOutvert: null,
  millInvert: null,
};

const createPayload = {
  firmId: FIRM_ID,
  machineId: MACHINE_ID,
  beamId: BEAM_ID,
  entryDate: '2024-01-15T10:00:00.000Z',
  takaSrNo: 'T-001',
  takaMeter: 25.50,
  productionQuality: 'Premium',
  weight: 12.75,
  productionChallanNo: 'PC-001',
};

const grantPermission = (action: string) => {
  const fieldMap: Record<string, string> = { view: 'canView', create: 'canCreate', edit: 'canEdit', delete: 'canDelete' };
  db.adminPermission.findUnique.mockResolvedValue({ [fieldMap[action]]: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
  (db.$transaction as jest.Mock).mockImplementation(async (cb: (tx: typeof db) => Promise<unknown>) => cb(db));
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/production
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/production', () => {
  it('200 — super_admin lists all production records', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get('/api/v1/production')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get('/api/v1/production')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filter applied', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get(`/api/v1/production?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?machine= filter applied', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get(`/api/v1/production?machine=${MACHINE_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?date_from= and ?date_to= filters applied', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get('/api/v1/production?date_from=2024-01-01&date_to=2024-01-31')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?search=T-001 searches by takaSrNo', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get('/api/v1/production?search=T-001')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?quality=Premium filters by quality', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([productionData]);

    const res = await request(app)
      .get('/api/v1/production?quality=Premium')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/production')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/production');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/production/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/production/:id', () => {
  it('200 — returns a single production record with all linked data', async () => {
    db.productionInfo.findFirst.mockResolvedValue(productionData);

    const res = await request(app)
      .get(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PRODUCTION_ID);
    expect(res.body.data.machine).toBeDefined();
    expect(res.body.data.beam).toBeDefined();
    expect(res.body.data.taka).toBeDefined();
  });

  it('404 — not found returns PRODUCTION_NOT_FOUND', async () => {
    db.productionInfo.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/production/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/production/${PRODUCTION_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/production
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/production', () => {
  it('201 — delegates to createProductionEntry service and returns record', async () => {
    mockCreate.mockResolvedValue(productionData);

    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.takaSrNo).toBe('T-001');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ takaSrNo: 'T-001' }));
  });

  it('201 — admin with create permission can create production entry', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    mockCreate.mockResolvedValue(productionData);

    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('404 — service throws FIRM_NOT_FOUND if firm missing', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(404, 'Firm not found', 'FIRM_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('409 — service throws TAKA_SR_NO_DUPLICATE on duplicate', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(409, 'Duplicate', 'TAKA_SR_NO_DUPLICATE'));

    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TAKA_SR_NO_DUPLICATE');
  });

  it('400 — missing required fields fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmId: FIRM_ID, takaSrNo: 'T-001' });

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/production')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/production').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/production/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/production/:id', () => {
  it('200 — updates production record and syncs taka', async () => {
    mockUpdate.mockResolvedValue({ ...productionData, remark: 'Updated remark' });

    const res = await request(app)
      .put(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ remark: 'Updated remark' });

    expect(res.status).toBe(200);
    expect(res.body.data.remark).toBe('Updated remark');
  });

  it('strips forbidden mill fields before passing to service', async () => {
    mockUpdate.mockResolvedValue(productionData);

    await request(app)
      .put(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({
        remark: 'Clean update',
        millName: 'INJECTED',
        millChallanNo: 'INJECTED-99',
        millOutvertId: 'fake-id',
        millInvertId: 'fake-id',
        millOutvertDate: '2026-01-01T00:00:00.000Z',
      });

    expect(mockUpdate).toHaveBeenCalledWith(
      PRODUCTION_ID,
      expect.not.objectContaining({ millName: 'INJECTED' }),
    );
  });

  it('404 — service throws PRODUCTION_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(404, 'Not found', 'PRODUCTION_NOT_FOUND'));

    const res = await request(app)
      .put('/api/v1/production/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ remark: 'x' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_NOT_FOUND');
  });

  it('409 — service throws TAKA_SR_NO_DUPLICATE on duplicate', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(409, 'Duplicate', 'TAKA_SR_NO_DUPLICATE'));

    const res = await request(app)
      .put(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ takaSrNo: 'T-002' });

    expect(res.status).toBe(409);
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ remark: 'x' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/production/${PRODUCTION_ID}`).send({ remark: 'x' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/production/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/production/:id', () => {
  it('200 — atomically soft-deletes production and linked taka', async () => {
    db.productionInfo.findFirst.mockResolvedValue(productionData);
    db.productionInfo.update.mockResolvedValue({ ...productionData, deletedAt: new Date() });
    db.taka.update.mockResolvedValue({});

    const res = await request(app)
      .delete(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    expect(db.productionInfo.update).toHaveBeenCalled();
    expect(db.taka.update).toHaveBeenCalled();
  });

  it('400 — linked to mill outvert returns PRODUCTION_IN_USE', async () => {
    db.productionInfo.findFirst.mockResolvedValue({
      ...productionData,
      millOutvertId: 'outvert-id',
    });

    const res = await request(app)
      .delete(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCTION_IN_USE');
  });

  it('400 — linked to mill invert returns PRODUCTION_IN_USE', async () => {
    db.productionInfo.findFirst.mockResolvedValue({
      ...productionData,
      millInvertId: 'invert-id',
    });

    const res = await request(app)
      .delete(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCTION_IN_USE');
  });

  it('404 — not found returns PRODUCTION_NOT_FOUND', async () => {
    db.productionInfo.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/production/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/production/${PRODUCTION_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/production/${PRODUCTION_ID}`);
    expect(res.status).toBe(401);
  });
});
