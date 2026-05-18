import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    beam: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    firm: { findFirst: jest.fn() },
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
const BEAM_ID = 'ffffffff-0000-0000-0000-000000000006';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const firmData = { id: FIRM_ID, firmName: 'Sunrise Textiles', deletedAt: null };

const beamData = {
  id: BEAM_ID,
  firmId: FIRM_ID,
  beamNo: 'B-001',
  tar: 120,
  beamQuality: 'High',
  takaQty: 50,
  beamMeter: '250.50',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  firm: { id: FIRM_ID, firmName: 'Sunrise Textiles', firmCode: 'SRT01' },
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
// GET /api/v1/beams
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/beams', () => {
  it('200 — super_admin lists all beams', async () => {
    db.beam.count.mockResolvedValue(2);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(2);
  });

  it('200 — admin with view permission can list beams', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('view');
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filters beams by firm', async () => {
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get(`/api/v1/beams?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?quality=High filters by beam quality', async () => {
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams?quality=High')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?meter_min=200 filters by minimum meter', async () => {
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams?meter_min=200')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?meter_max=300 filters by maximum meter', async () => {
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams?meter_max=300')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?search=High searches by beamNo/beamQuality', async () => {
    db.beam.count.mockResolvedValue(1);
    db.beam.findMany.mockResolvedValue([beamData]);

    const res = await request(app)
      .get('/api/v1/beams?search=High')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/beams')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/beams');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/beams/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/beams/:id', () => {
  it('200 — returns a single beam with firm included', async () => {
    db.beam.findFirst.mockResolvedValue(beamData);

    const res = await request(app)
      .get(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(BEAM_ID);
    expect(res.body.data.firm).toBeDefined();
  });

  it('404 — not found returns BEAM_NOT_FOUND', async () => {
    db.beam.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/beams/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/beams/${BEAM_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/beams
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/beams', () => {
  const createPayload = {
    firmId: FIRM_ID,
    beamNo: 'B-001',
    tar: 120,
    beamQuality: 'High',
    takaQty: 50,
    beamMeter: 250.50,
  };

  it('201 — creates a beam', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.beam.findFirst.mockResolvedValue(null);
    db.beam.create.mockResolvedValue(beamData);

    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.beamNo).toBe('B-001');
  });

  it('201 — admin with create permission can create beam', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission('create');
    db.firm.findFirst.mockResolvedValue(firmData);
    db.beam.findFirst.mockResolvedValue(null);
    db.beam.create.mockResolvedValue(beamData);

    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
  });

  it('404 — firm not found returns FIRM_NOT_FOUND', async () => {
    db.firm.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('409 — duplicate beam number in same firm returns BEAM_NO_DUPLICATE', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.beam.findFirst.mockResolvedValue(beamData);

    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BEAM_NO_DUPLICATE');
  });

  it('400 — missing beamNo fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmId: FIRM_ID, tar: 100, beamQuality: 'High', takaQty: 10, beamMeter: 100 });

    expect(res.status).toBe(400);
  });

  it('400 — missing tar fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmId: FIRM_ID, beamNo: 'B-X', beamQuality: 'High', takaQty: 10, beamMeter: 100 });

    expect(res.status).toBe(400);
  });

  it('403 — admin without create permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/v1/beams')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/beams').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/beams/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/beams/:id', () => {
  it('200 — updates beam meter', async () => {
    db.beam.findFirst.mockResolvedValueOnce(beamData);
    db.beam.update.mockResolvedValue({ ...beamData, beamMeter: '300.75' });

    const res = await request(app)
      .put(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ beamMeter: 300.75 });

    expect(res.status).toBe(200);
    expect(res.body.data.beamMeter).toBe('300.75');
  });

  it('409 — changing to duplicate beam number returns BEAM_NO_DUPLICATE', async () => {
    db.beam.findFirst
      .mockResolvedValueOnce(beamData)
      .mockResolvedValueOnce({ id: 'other-id', beamNo: 'B-002' });

    const res = await request(app)
      .put(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ beamNo: 'B-002' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BEAM_NO_DUPLICATE');
  });

  it('404 — not found returns BEAM_NOT_FOUND', async () => {
    db.beam.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/beams/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ beamMeter: 300 });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_NOT_FOUND');
  });

  it('403 — admin without edit permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ beamMeter: 300 });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/beams/${BEAM_ID}`).send({ beamMeter: 300 });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/beams/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/beams/:id', () => {
  it('200 — soft-deletes beam with no production records', async () => {
    db.beam.findFirst.mockResolvedValue(beamData);
    db.productionInfo.count.mockResolvedValue(0);
    db.beam.update.mockResolvedValue({ ...beamData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — beam with linked production records returns BEAM_IN_USE', async () => {
    db.beam.findFirst.mockResolvedValue(beamData);
    db.productionInfo.count.mockResolvedValue(3);

    const res = await request(app)
      .delete(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('BEAM_IN_USE');
  });

  it('404 — not found returns BEAM_NOT_FOUND', async () => {
    db.beam.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/beams/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('BEAM_NOT_FOUND');
  });

  it('403 — admin without delete permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/beams/${BEAM_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/beams/${BEAM_ID}`);
    expect(res.status).toBe(401);
  });
});
