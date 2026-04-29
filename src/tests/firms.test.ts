import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    firm: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    machine: { count: jest.fn() },
    beam: { count: jest.fn() },
    productionInfo: { count: jest.fn() },
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
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const firmData = {
  id: FIRM_ID,
  firmName: 'Sunrise Textiles',
  firmCode: 'SRT01',
  challanEnable: false,
  srNoSeries: null,
  address: 'Surat, Gujarat',
  contactPerson: 'Rajesh Shah',
  contactNumber: '9876543210',
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ userId: SUPER_ADMIN_ID, role: 'super_admin', email: 'superadmin@test.com' });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/firms
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/firms', () => {
  it('200 — super_admin gets paginated list', async () => {
    db.firm.count.mockResolvedValue(1);
    db.firm.findMany.mockResolvedValue([firmData]);

    const res = await request(app)
      .get('/api/v1/firms')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — ?search= filters by firmName/firmCode', async () => {
    db.firm.count.mockResolvedValue(1);
    db.firm.findMany.mockResolvedValue([firmData]);

    const res = await request(app)
      .get('/api/v1/firms?search=Sunrise')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(db.firm.findMany).toHaveBeenCalled();
  });

  it('200 — ?status=active filters by status', async () => {
    db.firm.count.mockResolvedValue(1);
    db.firm.findMany.mockResolvedValue([firmData]);

    const res = await request(app)
      .get('/api/v1/firms?status=active')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — pagination params are respected', async () => {
    db.firm.count.mockResolvedValue(30);
    db.firm.findMany.mockResolvedValue([firmData]);

    const res = await request(app)
      .get('/api/v1/firms?page=2&limit=5')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(2);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.totalPages).toBe(6);
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .get('/api/v1/firms')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/firms');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/firms
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/firms', () => {
  const createPayload = {
    firmName: 'Sunrise Textiles',
    firmCode: 'SRT01',
    challanEnable: false,
    address: 'Surat, Gujarat',
    contactPerson: 'Rajesh Shah',
    contactNumber: '9876543210',
  };

  it('201 — creates a firm', async () => {
    db.firm.findFirst.mockResolvedValue(null); // no name conflict
    // second call: no code conflict
    db.firm.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    db.firm.create.mockResolvedValue(firmData);

    const res = await request(app)
      .post('/api/v1/firms')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.firmName).toBe('Sunrise Textiles');
  });

  it('409 — duplicate firm name returns FIRM_NAME_DUPLICATE', async () => {
    db.firm.findFirst.mockResolvedValueOnce(firmData); // name conflict

    const res = await request(app)
      .post('/api/v1/firms')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FIRM_NAME_DUPLICATE');
  });

  it('409 — duplicate firm code returns FIRM_CODE_DUPLICATE', async () => {
    db.firm.findFirst
      .mockResolvedValueOnce(null)      // no name conflict
      .mockResolvedValueOnce(firmData); // code conflict

    const res = await request(app)
      .post('/api/v1/firms')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FIRM_CODE_DUPLICATE');
  });

  it('400 — missing firmName fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/firms')
      .set('Authorization', SUPER_TOKEN)
      .send({ firmCode: 'X' });

    expect(res.status).toBe(400);
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .post('/api/v1/firms')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/firms').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/firms/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/firms/:id', () => {
  it('200 — returns a single firm', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);

    const res = await request(app)
      .get(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(FIRM_ID);
  });

  it('404 — not found returns FIRM_NOT_FOUND', async () => {
    db.firm.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/firms/non-existent-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .get(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/firms/${FIRM_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/firms/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/firms/:id', () => {
  it('200 — updates a firm (e.g. enable challan)', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.firm.update.mockResolvedValue({ ...firmData, challanEnable: true });

    const res = await request(app)
      .put(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ challanEnable: true });

    expect(res.status).toBe(200);
    expect(res.body.data.challanEnable).toBe(true);
  });

  it('404 — not found returns FIRM_NOT_FOUND', async () => {
    db.firm.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/firms/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ address: 'New Address' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .put(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ address: 'New Address' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/firms/${FIRM_ID}`).send({ address: 'x' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/firms/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/firms/:id', () => {
  it('200 — soft-deletes a firm with no linked data', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.machine.count.mockResolvedValue(0);
    db.beam.count.mockResolvedValue(0);
    db.productionInfo.count.mockResolvedValue(0);
    db.firm.update.mockResolvedValue({ ...firmData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — firm with active machines returns FIRM_IN_USE', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.machine.count.mockResolvedValue(2);
    db.beam.count.mockResolvedValue(0);
    db.productionInfo.count.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FIRM_IN_USE');
  });

  it('400 — firm with active beams returns FIRM_IN_USE', async () => {
    db.firm.findFirst.mockResolvedValue(firmData);
    db.machine.count.mockResolvedValue(0);
    db.beam.count.mockResolvedValue(1);
    db.productionInfo.count.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FIRM_IN_USE');
  });

  it('404 — not found returns FIRM_NOT_FOUND', async () => {
    db.firm.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/firms/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('FIRM_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .delete(`/api/v1/firms/${FIRM_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/firms/${FIRM_ID}`);
    expect(res.status).toBe(401);
  });
});
