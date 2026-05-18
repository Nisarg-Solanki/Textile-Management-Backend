import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    millInvert: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    adminPermission: { findUnique: jest.fn() },
  },
}));

jest.mock('../lib/jwt', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../services/millInvert.service', () => ({
  createMillInvert: jest.fn(),
  updateMillInvert: jest.fn(),
  deleteMillInvert: jest.fn(),
}));

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { createMillInvert, updateMillInvert, deleteMillInvert } from '../services/millInvert.service';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockVerify = verifyAccessToken as jest.Mock;
const mockCreate = createMillInvert as jest.Mock;
const mockUpdate = updateMillInvert as jest.Mock;
const mockDelete = deleteMillInvert as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const FIRM_ID = 'cccccccc-0000-0000-0000-000000000003';
const MILL_ID = 'dddddddd-0000-0000-0000-000000000004';
const OUTVERT_ID = '33333333-0000-0000-0000-000000000009';
const INVERT_ID = '44444444-0000-0000-0000-000000000010';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const invertData = {
  id: INVERT_ID,
  firmId: FIRM_ID,
  millId: MILL_ID,
  millOutvertId: OUTVERT_ID,
  invertDate: new Date('2024-02-01T09:00:00.000Z'),
  millChallanNo: 'MC-001',
  firmChallanNo: 'FC-001',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  mill: { id: MILL_ID, millName: 'E2E Test Mill', millCode: 'M001' },
  millOutvert: { id: OUTVERT_ID, firmChallanNo: 'FC-001', outvertDate: new Date('2024-01-20') },
  invertTakas: [{ id: 'it-1', takaSrNo: 'T-001' }],
};

const createPayload = {
  firmId: FIRM_ID,
  millId: MILL_ID,
  millOutvertId: OUTVERT_ID,
  invertDate: '2024-02-01T09:00:00.000Z',
  millChallanNo: 'MC-001',
  firmChallanNo: 'FC-001',
  takaSrNos: ['T-001'],
};

const grantPermission = (action: string) => {
  const fieldMap: Record<string, string> = { view: 'canView', create: 'canCreate', edit: 'canEdit', delete: 'canDelete' };
  db.adminPermission.findUnique.mockResolvedValue({ [fieldMap[action]]: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/mill-inverts
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mill-inverts', () => {
  it('200 — super_admin lists all inverts', async () => {
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get('/api/v1/mill-inverts')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?search=MC-001 searches by millChallanNo/firmChallanNo', async () => {
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get('/api/v1/mill-inverts?search=MC-001')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?mill= filter by millId', async () => {
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get(`/api/v1/mill-inverts?mill=${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?date_from= and ?date_to= filter applied', async () => {
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get('/api/v1/mill-inverts?date_from=2024-01-01&date_to=2024-03-31')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filter applied', async () => {
    db.millInvert.count.mockResolvedValue(1);
    db.millInvert.findMany.mockResolvedValue([invertData]);

    const res = await request(app)
      .get(`/api/v1/mill-inverts?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mill-inverts')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/mill-inverts');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/mill-inverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mill-inverts/:id', () => {
  it('200 — returns invert with invertTakas, mill, millOutvert, and productionInfos', async () => {
    db.millInvert.findFirst.mockResolvedValue({
      ...invertData,
      productionInfos: [{ id: 'pi-1', takaSrNo: 'T-001', millChallanNo: 'MC-001' }],
    });

    const res = await request(app)
      .get(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(INVERT_ID);
    expect(res.body.data.invertTakas).toHaveLength(1);
    expect(res.body.data.mill).toBeDefined();
    expect(res.body.data.millOutvert).toBeDefined();
  });

  it('404 — not found returns MILL_INVERT_NOT_FOUND', async () => {
    db.millInvert.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mill-inverts/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_INVERT_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/mill-inverts/${INVERT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/mill-inverts
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/mill-inverts', () => {
  it('201 — creates invert via service and syncs production records', async () => {
    mockCreate.mockResolvedValue(invertData);

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.millChallanNo).toBe('MC-001');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ millChallanNo: 'MC-001' }));
  });

  it('201 — admin with create permission can create invert', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    mockCreate.mockResolvedValue(invertData);

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('404 — service throws FIRM_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(404, 'Firm not found', 'FIRM_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('404 — service throws MILL_OUTVERT_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(404, 'Not found', 'MILL_OUTVERT_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
  });

  it('409 — duplicate millChallanNo returns MILL_CHALLAN_DUPLICATE', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(409, 'Duplicate millChallanNo', 'MILL_CHALLAN_DUPLICATE'));

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MILL_CHALLAN_DUPLICATE');
  });

  it('409 — duplicate firmChallanNo within firm returns conflict', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(409, 'Duplicate', 'CHALLAN_DUPLICATE'));

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send({ ...createPayload, firmChallanNo: 'FINV-EXISTING' });

    expect(res.status).toBe(409);
  });

  it('400 — service throws TAKA_NOT_FOUND for invalid takaSrNo', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(400, 'Not found', 'TAKA_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send({ ...createPayload, takaSrNos: ['DOES-NOT-EXIST'] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TAKA_NOT_FOUND');
  });

  it('400 — missing millChallanNo fails validation', async () => {
    const { firmChallanNo: _fc, millChallanNo: _mc, ...payload } = createPayload;
    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', SUPER_TOKEN)
      .send(payload);

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/mill-inverts')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/mill-inverts').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/mill-inverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/mill-inverts/:id', () => {
  it('200 — updates invert via service', async () => {
    mockUpdate.mockResolvedValue({ ...invertData, invertDate: new Date('2024-02-10') });

    const res = await request(app)
      .put(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ invertDate: '2024-02-10T09:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(INVERT_ID, expect.objectContaining({ invertDate: '2024-02-10T09:00:00.000Z' }));
  });

  it('404 — service throws MILL_INVERT_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(404, 'Not found', 'MILL_INVERT_NOT_FOUND'));

    const res = await request(app)
      .put('/api/v1/mill-inverts/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ invertDate: '2024-02-10T09:00:00.000Z' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_INVERT_NOT_FOUND');
  });

  it('409 — service throws duplicate challan', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(409, 'Duplicate', 'MILL_CHALLAN_DUPLICATE'));

    const res = await request(app)
      .put(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ millChallanNo: 'MC-EXISTING' });

    expect(res.status).toBe(409);
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ invertDate: '2024-02-10T09:00:00.000Z' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/mill-inverts/${INVERT_ID}`).send({});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/mill-inverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/mill-inverts/:id', () => {
  it('200 — soft-deletes invert and clears production fields via service', async () => {
    mockDelete.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    expect(mockDelete).toHaveBeenCalledWith(INVERT_ID);
  });

  it('404 — service throws MILL_INVERT_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockDelete.mockRejectedValue(new AppError(404, 'Not found', 'MILL_INVERT_NOT_FOUND'));

    const res = await request(app)
      .delete('/api/v1/mill-inverts/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_INVERT_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/mill-inverts/${INVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/mill-inverts/${INVERT_ID}`);
    expect(res.status).toBe(401);
  });
});
