import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    productionQuality: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
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
const PRODUCTION_QUALITY_ID = 'eeeeeeee-0000-0000-0000-000000000005';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const productionQualityData = {
  id: PRODUCTION_QUALITY_ID,
  name: 'Plain',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
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
// GET /api/v1/production-qualities
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/production-qualities', () => {
  it('200 — super_admin gets paginated list', async () => {
    db.productionQuality.count.mockResolvedValue(1);
    db.productionQuality.findMany.mockResolvedValue([productionQualityData]);

    const res = await request(app)
      .get('/api/v1/production-qualities')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list production qualities', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.productionQuality.count.mockResolvedValue(1);
    db.productionQuality.findMany.mockResolvedValue([productionQualityData]);

    const res = await request(app)
      .get('/api/v1/production-qualities')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?status=inactive filters by status', async () => {
    db.productionQuality.count.mockResolvedValue(0);
    db.productionQuality.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/production-qualities?status=inactive')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 — ?search=Plain filters by name', async () => {
    db.productionQuality.count.mockResolvedValue(1);
    db.productionQuality.findMany.mockResolvedValue([productionQualityData]);

    const res = await request(app)
      .get('/api/v1/production-qualities?search=Plain')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/production-qualities')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/production-qualities');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/production-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/production-qualities/:id', () => {
  it('200 — returns a single production quality', async () => {
    db.productionQuality.findFirst.mockResolvedValue(productionQualityData);

    const res = await request(app)
      .get(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(PRODUCTION_QUALITY_ID);
    expect(res.body.data.name).toBe('Plain');
  });

  it('404 — not found returns PRODUCTION_QUALITY_NOT_FOUND', async () => {
    db.productionQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/production-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/production-qualities
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/production-qualities', () => {
  const createPayload = { name: 'Plain' };

  it('201 — creates a production quality', async () => {
    db.productionQuality.findFirst.mockResolvedValue(null);
    db.productionQuality.create.mockResolvedValue(productionQualityData);

    const res = await request(app)
      .post('/api/v1/production-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Plain');
    expect(res.body.message).toMatch(/created/i);
  });

  it('201 — admin with create permission can create production quality', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    db.productionQuality.findFirst.mockResolvedValue(null);
    db.productionQuality.create.mockResolvedValue(productionQualityData);

    const res = await request(app)
      .post('/api/v1/production-qualities')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('409 — duplicate name returns PRODUCTION_QUALITY_DUPLICATE', async () => {
    db.productionQuality.findFirst.mockResolvedValue(productionQualityData);

    const res = await request(app)
      .post('/api/v1/production-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_DUPLICATE');
  });

  it('400 — missing name fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/production-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send({});

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/production-qualities')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/production-qualities').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/production-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/production-qualities/:id', () => {
  it('200 — updates production quality name', async () => {
    db.productionQuality.findFirst
      .mockResolvedValueOnce(productionQualityData)
      .mockResolvedValueOnce(null);
    db.productionQuality.update.mockResolvedValue({ ...productionQualityData, name: 'Twill' });

    const res = await request(app)
      .put(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ name: 'Twill' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Twill');
  });

  it('200 — updates production quality status', async () => {
    db.productionQuality.findFirst.mockResolvedValueOnce(productionQualityData);
    db.productionQuality.update.mockResolvedValue({ ...productionQualityData, status: 'inactive' });

    const res = await request(app)
      .put(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  it('409 — changing to a duplicate name returns PRODUCTION_QUALITY_DUPLICATE', async () => {
    db.productionQuality.findFirst
      .mockResolvedValueOnce(productionQualityData)
      .mockResolvedValueOnce({ id: 'other-id', name: 'Twill' });

    const res = await request(app)
      .put(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ name: 'Twill' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_DUPLICATE');
  });

  it('404 — not found returns PRODUCTION_QUALITY_NOT_FOUND', async () => {
    db.productionQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/production-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ name: 'Twill' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_NOT_FOUND');
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ name: 'Twill' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`).send({ name: 'Twill' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/production-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/production-qualities/:id', () => {
  it('200 — soft-deletes production quality with no linked production records', async () => {
    db.productionQuality.findFirst.mockResolvedValue(productionQualityData);
    db.productionInfo.count.mockResolvedValue(0);
    db.productionQuality.update.mockResolvedValue({ ...productionQualityData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — production quality with linked records returns PRODUCTION_QUALITY_IN_USE', async () => {
    db.productionQuality.findFirst.mockResolvedValue(productionQualityData);
    db.productionInfo.count.mockResolvedValue(5);

    const res = await request(app)
      .delete(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_IN_USE');
  });

  it('404 — not found returns PRODUCTION_QUALITY_NOT_FOUND', async () => {
    db.productionQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/production-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCTION_QUALITY_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/production-qualities/${PRODUCTION_QUALITY_ID}`);
    expect(res.status).toBe(401);
  });
});
