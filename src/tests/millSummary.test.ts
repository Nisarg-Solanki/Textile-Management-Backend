import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    productionInfo: {
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
const OUTVERT_ID = 'eeeeeeee-0000-0000-0000-000000000005';
const INVERT_ID = 'hhhhhhhh-0000-0000-0000-000000000008';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const pendingRow = {
  id: 'prod-pending',
  takaSrNo: 'T-001',
  millOutvertDate: null,
  millChallanNo: null,
  millName: null,
  millOutvertId: null,
  millInvertId: null,
  millOutvert: null,
  millInvert: null,
};

const sentRow = {
  id: 'prod-sent',
  takaSrNo: 'T-002',
  millOutvertDate: new Date('2024-02-01T00:00:00.000Z'),
  millChallanNo: null,
  millName: 'Sunrise Mill',
  millOutvertId: OUTVERT_ID,
  millInvertId: null,
  millOutvert: { outvertDate: new Date('2024-02-01T00:00:00.000Z'), firmChallanNo: 'CH-001' },
  millInvert: null,
};

const returnedRow = {
  id: 'prod-returned',
  takaSrNo: 'T-003',
  millOutvertDate: new Date('2024-02-01T00:00:00.000Z'),
  millChallanNo: 'MC-001',
  millName: 'Sunrise Mill',
  millOutvertId: OUTVERT_ID,
  millInvertId: INVERT_ID,
  millOutvert: { outvertDate: new Date('2024-02-01T00:00:00.000Z'), firmChallanNo: 'CH-001' },
  millInvert: { invertDate: new Date('2024-02-10T00:00:00.000Z'), millChallanNo: 'MC-001' },
};

const grantPermission = () => {
  db.adminPermission.findUnique.mockResolvedValue({ canView: true });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/mill-summary
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mill-summary', () => {
  it('200 — super_admin gets paginated mill summary', async () => {
    db.productionInfo.count.mockResolvedValue(3);
    db.productionInfo.findMany.mockResolvedValue([pendingRow, sentRow, returnedRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination.total).toBe(3);
  });

  it('200 — admin with mill_summary view permission can access', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    grantPermission();
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?status=pending filters takas with no outvert', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([pendingRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?status=pending')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].takaSrNo).toBe('T-001');
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ millOutvertId: null }),
      }),
    );
  });

  it('200 — ?status=sent filters takas outvert but not yet inverted', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?status=sent')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data[0].takaSrNo).toBe('T-002');
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          millOutvertId: { not: null },
          millInvertId: null,
        }),
      }),
    );
  });

  it('200 — ?status=returned filters takas that have been inverted', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([returnedRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?status=returned')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data[0].takaSrNo).toBe('T-003');
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          millInvertId: { not: null },
        }),
      }),
    );
  });

  it('200 — ?search=T-002 filters by takaSrNo', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?search=T-002')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          takaSrNo: { contains: 'T-002', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('200 — ?mill=Sunrise filters by millName', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?mill=Sunrise')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          millName: { contains: 'Sunrise', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('200 — ?date_from= filters millOutvertDate >=', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?date_from=2024-02-01')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          millOutvertDate: { gte: new Date('2024-02-01') },
        }),
      }),
    );
  });

  it('200 — ?date_to= filters millOutvertDate <=', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?date_to=2024-02-28')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          millOutvertDate: { lte: new Date('2024-02-28') },
        }),
      }),
    );
  });

  it('200 — ?firmId= filters by firm', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get(`/api/v1/mill-summary?firmId=${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.productionInfo.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ firmId: FIRM_ID }),
      }),
    );
  });

  it('200 — pagination params respected', async () => {
    db.productionInfo.count.mockResolvedValue(50);
    db.productionInfo.findMany.mockResolvedValue([sentRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary?page=3&limit=10')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(3);
    expect(res.body.pagination.limit).toBe(10);
    expect(res.body.pagination.total).toBe(50);
    expect(res.body.pagination.totalPages).toBe(5);
  });

  it('200 — response includes nested millOutvert and millInvert', async () => {
    db.productionInfo.count.mockResolvedValue(1);
    db.productionInfo.findMany.mockResolvedValue([returnedRow]);

    const res = await request(app)
      .get('/api/v1/mill-summary')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    const row = res.body.data[0];
    expect(row.millOutvert).toBeDefined();
    expect(row.millOutvert.firmChallanNo).toBe('CH-001');
    expect(row.millInvert).toBeDefined();
    expect(row.millInvert.millChallanNo).toBe('MC-001');
  });

  it('200 — empty result returns empty data array', async () => {
    db.productionInfo.count.mockResolvedValue(0);
    db.productionInfo.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/mill-summary')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('403 — admin without mill_summary view permission returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });
    db.adminPermission.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mill-summary')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth token returns 401', async () => {
    const res = await request(app).get('/api/v1/mill-summary');
    expect(res.status).toBe(401);
  });
});
