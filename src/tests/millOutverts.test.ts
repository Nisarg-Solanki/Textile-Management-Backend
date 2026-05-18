import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    millOutvert: {
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

jest.mock('../services/millOutvert.service', () => ({
  createMillOutvert: jest.fn(),
  updateMillOutvert: jest.fn(),
  deleteMillOutvert: jest.fn(),
}));

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { createMillOutvert, updateMillOutvert, deleteMillOutvert } from '../services/millOutvert.service';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockVerify = verifyAccessToken as jest.Mock;
const mockCreate = createMillOutvert as jest.Mock;
const mockUpdate = updateMillOutvert as jest.Mock;
const mockDelete = deleteMillOutvert as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const FIRM_ID = 'cccccccc-0000-0000-0000-000000000003';
const MILL_ID = 'dddddddd-0000-0000-0000-000000000004';
const OUTVERT_ID = '33333333-0000-0000-0000-000000000009';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const outvertData = {
  id: OUTVERT_ID,
  firmId: FIRM_ID,
  millId: MILL_ID,
  outvertDate: new Date('2024-01-20T08:00:00.000Z'),
  firmChallanNo: 'FC-001',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  mill: { id: MILL_ID, millName: 'E2E Test Mill', millCode: 'M001' },
  outvertTakas: [{ id: 'ot-1', takaSrNo: 'T-001' }],
};

const createPayload = {
  firmId: FIRM_ID,
  millId: MILL_ID,
  outvertDate: '2024-01-20T08:00:00.000Z',
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
// GET /api/v1/mill-outverts
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mill-outverts', () => {
  it('200 — super_admin lists all outverts', async () => {
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get('/api/v1/mill-outverts')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filter applied', async () => {
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get(`/api/v1/mill-outverts?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?mill= filter by millId', async () => {
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get(`/api/v1/mill-outverts?mill=${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?search=FC-001 searches by firmChallanNo', async () => {
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get('/api/v1/mill-outverts?search=FC-001')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?date_from= and ?date_to= filter applied', async () => {
    db.millOutvert.count.mockResolvedValue(1);
    db.millOutvert.findMany.mockResolvedValue([outvertData]);

    const res = await request(app)
      .get('/api/v1/mill-outverts?date_from=2024-01-01&date_to=2024-01-31')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mill-outverts')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/mill-outverts');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/mill-outverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mill-outverts/:id', () => {
  it('200 — returns outvert with outvertTakas and productionInfos', async () => {
    db.millOutvert.findFirst.mockResolvedValue({
      ...outvertData,
      productionInfos: [{ id: 'pi-1', takaSrNo: 'T-001', millOutvertDate: new Date() }],
    });

    const res = await request(app)
      .get(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(OUTVERT_ID);
    expect(res.body.data.outvertTakas).toHaveLength(1);
  });

  it('404 — not found returns MILL_OUTVERT_NOT_FOUND', async () => {
    db.millOutvert.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mill-outverts/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_OUTVERT_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/mill-outverts/${OUTVERT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/mill-outverts
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/mill-outverts', () => {
  it('201 — creates outvert via service and syncs production records', async () => {
    mockCreate.mockResolvedValue(outvertData);

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.firmChallanNo).toBe('FC-001');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ firmChallanNo: 'FC-001' }));
  });

  it('201 — admin with create permission can create outvert', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    mockCreate.mockResolvedValue(outvertData);

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('404 — service throws FIRM_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(404, 'Firm not found', 'FIRM_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('404 — service throws MILL_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(404, 'Mill not found', 'MILL_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_NOT_FOUND');
  });

  it('409 — service throws CHALLAN_DUPLICATE on duplicate firmChallanNo', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(409, 'Duplicate', 'CHALLAN_DUPLICATE'));

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHALLAN_DUPLICATE');
  });

  it('400 — service throws TAKA_NOT_FOUND for invalid takaSrNo', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockCreate.mockRejectedValue(new AppError(400, 'Taka not found', 'TAKA_NOT_FOUND'));

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send({ ...createPayload, takaSrNos: ['DOES-NOT-EXIST'] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TAKA_NOT_FOUND');
  });

  it('400 — missing takaSrNos fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmId: FIRM_ID, millId: MILL_ID, outvertDate: '2024-01-20', firmChallanNo: 'FC-002' });

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/mill-outverts')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/mill-outverts').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/mill-outverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/mill-outverts/:id', () => {
  it('200 — updates outvert via service', async () => {
    mockUpdate.mockResolvedValue({ ...outvertData, outvertDate: new Date('2024-01-30') });

    const res = await request(app)
      .put(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ outvertDate: '2024-01-30T08:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(OUTVERT_ID, expect.objectContaining({ outvertDate: '2024-01-30T08:00:00.000Z' }));
  });

  it('404 — service throws MILL_OUTVERT_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(404, 'Not found', 'MILL_OUTVERT_NOT_FOUND'));

    const res = await request(app)
      .put('/api/v1/mill-outverts/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ outvertDate: '2024-01-30T08:00:00.000Z' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_OUTVERT_NOT_FOUND');
  });

  it('409 — service throws CHALLAN_DUPLICATE', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockUpdate.mockRejectedValue(new AppError(409, 'Duplicate', 'CHALLAN_DUPLICATE'));

    const res = await request(app)
      .put(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ firmChallanNo: 'FC-EXISTING' });

    expect(res.status).toBe(409);
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ outvertDate: '2024-01-30T08:00:00.000Z' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/mill-outverts/${OUTVERT_ID}`).send({});
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/mill-outverts/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/mill-outverts/:id', () => {
  it('200 — soft-deletes outvert and clears production fields via service', async () => {
    mockDelete.mockResolvedValue(undefined);

    const res = await request(app)
      .delete(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
    expect(mockDelete).toHaveBeenCalledWith(OUTVERT_ID);
  });

  it('404 — service throws MILL_OUTVERT_NOT_FOUND', async () => {
    const { AppError } = jest.requireActual('../lib/errors') as { AppError: new (code: number, msg: string, key: string) => Error };
    mockDelete.mockRejectedValue(new AppError(404, 'Not found', 'MILL_OUTVERT_NOT_FOUND'));

    const res = await request(app)
      .delete('/api/v1/mill-outverts/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_OUTVERT_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/mill-outverts/${OUTVERT_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/mill-outverts/${OUTVERT_ID}`);
    expect(res.status).toBe(401);
  });
});
