import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    beamQuality: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    beam: { count: jest.fn() },
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
const BEAM_QUALITY_ID = 'dddddddd-0000-0000-0000-000000000004';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const beamQualityData = {
  id: BEAM_QUALITY_ID,
  name: '60s',
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
// GET /api/v1/beam-qualities
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/beam-qualities', () => {
  it('200 — super_admin gets paginated list', async () => {
    db.beamQuality.count.mockResolvedValue(1);
    db.beamQuality.findMany.mockResolvedValue([beamQualityData]);

    const res = await request(app)
      .get('/api/v1/beam-qualities')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list beam qualities', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.beamQuality.count.mockResolvedValue(1);
    db.beamQuality.findMany.mockResolvedValue([beamQualityData]);

    const res = await request(app)
      .get('/api/v1/beam-qualities')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?status=inactive filters by status', async () => {
    db.beamQuality.count.mockResolvedValue(0);
    db.beamQuality.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/beam-qualities?status=inactive')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 — ?search=60s filters by name', async () => {
    db.beamQuality.count.mockResolvedValue(1);
    db.beamQuality.findMany.mockResolvedValue([beamQualityData]);

    const res = await request(app)
      .get('/api/v1/beam-qualities?search=60s')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/beam-qualities')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/beam-qualities');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/beam-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/beam-qualities/:id', () => {
  it('200 — returns a single beam quality', async () => {
    db.beamQuality.findFirst.mockResolvedValue(beamQualityData);

    const res = await request(app)
      .get(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(BEAM_QUALITY_ID);
    expect(res.body.data.name).toBe('60s');
  });

  it('404 — not found returns BEAM_QUALITY_NOT_FOUND', async () => {
    db.beamQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/beam-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_QUALITY_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/beam-qualities
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/beam-qualities', () => {
  const createPayload = { name: '60s' };

  it('201 — creates a beam quality', async () => {
    db.beamQuality.findFirst.mockResolvedValue(null);
    db.beamQuality.create.mockResolvedValue(beamQualityData);

    const res = await request(app)
      .post('/api/v1/beam-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('60s');
    expect(res.body.message).toMatch(/created/i);
  });

  it('201 — admin with create permission can create beam quality', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    db.beamQuality.findFirst.mockResolvedValue(null);
    db.beamQuality.create.mockResolvedValue(beamQualityData);

    const res = await request(app)
      .post('/api/v1/beam-qualities')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('409 — duplicate name returns BEAM_QUALITY_DUPLICATE', async () => {
    db.beamQuality.findFirst.mockResolvedValue(beamQualityData);

    const res = await request(app)
      .post('/api/v1/beam-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BEAM_QUALITY_DUPLICATE');
  });

  it('400 — missing name fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/beam-qualities')
      .set('Authorization', SUPER_TOKEN)
      .send({});

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/beam-qualities')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/beam-qualities').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/beam-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/beam-qualities/:id', () => {
  it('200 — updates beam quality name', async () => {
    db.beamQuality.findFirst
      .mockResolvedValueOnce(beamQualityData)
      .mockResolvedValueOnce(null);
    db.beamQuality.update.mockResolvedValue({ ...beamQualityData, name: '80s' });

    const res = await request(app)
      .put(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ name: '80s' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('80s');
  });

  it('200 — updates beam quality status', async () => {
    db.beamQuality.findFirst.mockResolvedValueOnce(beamQualityData);
    db.beamQuality.update.mockResolvedValue({ ...beamQualityData, status: 'inactive' });

    const res = await request(app)
      .put(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ status: 'inactive' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('inactive');
  });

  it('409 — changing to a duplicate name returns BEAM_QUALITY_DUPLICATE', async () => {
    db.beamQuality.findFirst
      .mockResolvedValueOnce(beamQualityData)
      .mockResolvedValueOnce({ id: 'other-id', name: '80s' });

    const res = await request(app)
      .put(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ name: '80s' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BEAM_QUALITY_DUPLICATE');
  });

  it('404 — not found returns BEAM_QUALITY_NOT_FOUND', async () => {
    db.beamQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/beam-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ name: '80s' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_QUALITY_NOT_FOUND');
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ name: '80s' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`).send({ name: '80s' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/beam-qualities/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/beam-qualities/:id', () => {
  it('200 — soft-deletes beam quality with no linked beams', async () => {
    db.beamQuality.findFirst.mockResolvedValue(beamQualityData);
    db.beam.count.mockResolvedValue(0);
    db.beamQuality.update.mockResolvedValue({ ...beamQualityData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — beam quality with linked beams returns BEAM_QUALITY_IN_USE', async () => {
    db.beamQuality.findFirst.mockResolvedValue(beamQualityData);
    db.beam.count.mockResolvedValue(3);

    const res = await request(app)
      .delete(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BEAM_QUALITY_IN_USE');
  });

  it('404 — not found returns BEAM_QUALITY_NOT_FOUND', async () => {
    db.beamQuality.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/beam-qualities/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_QUALITY_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/beam-qualities/${BEAM_QUALITY_ID}`);
    expect(res.status).toBe(401);
  });
});
