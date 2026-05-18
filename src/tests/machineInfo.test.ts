import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    productionInfo: {
      findMany: jest.fn(),
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
const MACHINE_ID = 'dddddddd-0000-0000-0000-000000000004';
const BEAM_ID = 'ffffffff-0000-0000-0000-000000000006';
const PRODUCTION_ID = '11111111-0000-0000-0000-000000000007';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const productionEntry = {
  id: PRODUCTION_ID,
  firmId: FIRM_ID,
  machineId: MACHINE_ID,
  beamId: BEAM_ID,
  takaSrNo: 'T-001',
  takaMeter: '25.50',
  entryDate: new Date('2024-01-15T10:00:00.000Z'),
  productionQuality: 'Premium',
  weight: '1.20',
  remark: null,
  productionChallanNo: null,
  millOutvertId: null,
  millInvertId: null,
  millOutvertDate: null,
  millChallanNo: null,
  millName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  machine: { id: MACHINE_ID, machineNo: 'M-101', firmId: FIRM_ID },
  beam: { id: BEAM_ID, beamNo: 'B-001' },
};

const grantPermission = () => {
  db.adminPermission.findUnique.mockResolvedValue({ canView: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/machine-info
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/machine-info', () => {
  it('200 — super_admin gets latest production entry per machine', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].machineNo).toBe('M-101');
    expect(res.body.data[0].beamNo).toBe('B-001');
    expect(res.body.data[0].takaSrNo).toBe('T-001');
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — admin with machine_info view permission can access', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission();
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?firmId= filters by firm', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get(`/api/v1/machine-info?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firmId: FIRM_ID }),
      }),
    );
  });

  it('200 — ?search=M-101 filters in-memory by machineNo', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info?search=M-101')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].machineNo).toBe('M-101');
  });

  it('200 — ?search= with no match returns empty data', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info?search=NOMATCH')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('200 — ?search= is case-insensitive', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info?search=m-101')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('200 — pagination params respected', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...productionEntry,
      id: `prod-${i}`,
      machine: { id: `machine-${i}`, machineNo: `M-10${i}`, firmId: FIRM_ID },
    }));
    db.productionInfo.findMany.mockResolvedValue(entries);

    const res = await request(app)
      .get('/api/v1/machine-info?page=1&limit=2')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.total).toBe(5);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.totalPages).toBe(3);
  });

  it('200 — page 2 returns next slice', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...productionEntry,
      id: `prod-${i}`,
      machine: { id: `machine-${i}`, machineNo: `M-10${i}`, firmId: FIRM_ID },
    }));
    db.productionInfo.findMany.mockResolvedValue(entries);

    const res = await request(app)
      .get('/api/v1/machine-info?page=2&limit=2')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.page).toBe(2);
  });

  it('200 — empty DB returns empty data with total 0', async () => {
    db.productionInfo.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/machine-info')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  it('200 — response shape includes all expected fields', async () => {
    db.productionInfo.findMany.mockResolvedValue([productionEntry]);

    const res = await request(app)
      .get('/api/v1/machine-info')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    const row = res.body.data[0];
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('machineNo');
    expect(row).toHaveProperty('firmId');
    expect(row).toHaveProperty('beamNo');
    expect(row).toHaveProperty('beamId');
    expect(row).toHaveProperty('takaSrNo');
    expect(row).toHaveProperty('takaMeter');
    expect(row).toHaveProperty('entryDate');
  });

  it('403 — admin without machine_info view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/machine-info')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth token returns 401', async () => {
    const res = await request(app).get('/api/v1/machine-info');
    expect(res.status).toBe(401);
  });
});
