import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    taka: {
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

jest.mock('express-rate-limit', () => () => (_req: unknown, _res: unknown, next: () => void) => next());

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const mockVerify = verifyAccessToken as jest.Mock;

const SUPER_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const ADMIN_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const FIRM_ID = 'cccccccc-0000-0000-0000-000000000003';
const BEAM_ID = 'ffffffff-0000-0000-0000-000000000006';
const PRODUCTION_ID = '11111111-0000-0000-0000-000000000007';
const TAKA_ID = '22222222-0000-0000-0000-000000000008';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const takaData = {
  id: TAKA_ID,
  firmId: FIRM_ID,
  productionInfoId: PRODUCTION_ID,
  takaSrNo: 'T-001',
  takaMeter: '25.50',
  beamId: BEAM_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  beam: { id: BEAM_ID, beamNo: 'B-001', beamQuality: 'Premium' },
  productionInfo: {
    id: PRODUCTION_ID,
    entryDate: new Date('2024-01-15T10:00:00.000Z'),
    machineId: 'machine-id',
    machine: { id: 'machine-id', machineNo: 'M-101', machineType: 'Rapier' },
    firm: { id: FIRM_ID, firmName: 'E2E Test Firm', firmCode: 'E2E001' },
  },
};

const grantPermission = () => {
  db.adminPermission.findUnique.mockResolvedValue({ canView: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/takas
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/takas', () => {
  it('200 — super_admin lists all takas', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with view permission can list takas', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission();
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filters takas by firm', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get(`/api/v1/takas?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?search=T-001 searches by takaSrNo', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas?search=T-001')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?beam_no=B-001 filters by beam number', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas?beam_no=B-001')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?meter_min=20 filters by minimum meter', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas?meter_min=20')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?meter_max=30 filters by maximum meter', async () => {
    db.taka.count.mockResolvedValue(1);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas?meter_max=30')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — pagination params respected', async () => {
    db.taka.count.mockResolvedValue(50);
    db.taka.findMany.mockResolvedValue([takaData]);

    const res = await request(app)
      .get('/api/v1/takas?page=2&limit=10')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(10);
  });

  it('403 — admin without view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/takas')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/takas');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/takas/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/takas/:id', () => {
  it('200 — returns taka with productionInfo, machine, and firm', async () => {
    db.taka.findFirst.mockResolvedValue(takaData);

    const res = await request(app)
      .get(`/api/v1/takas/${TAKA_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(TAKA_ID);
    expect(res.body.data.productionInfo).toBeDefined();
    expect(res.body.data.beam).toBeDefined();
  });

  it('404 — not found returns TAKA_NOT_FOUND', async () => {
    db.taka.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/takas/00000000-0000-0000-0000-000000000000')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TAKA_NOT_FOUND');
  });

  it('403 — admin without permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/api/v1/takas/${TAKA_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/takas/${TAKA_ID}`);
    expect(res.status).toBe(401);
  });
});
