import request from 'supertest';
import app from '../app';

jest.mock('../lib/prisma', () => ({
  prisma: {
    mill: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    millOutvert: { count: jest.fn() },
    millInvert: { count: jest.fn() },
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
const MILL_ID = 'dddddddd-0000-0000-0000-000000000004';
const SUPER_TOKEN = 'Bearer mock-super-token';
const ADMIN_TOKEN = 'Bearer mock-admin-token';

const millData = {
  id: MILL_ID,
  millName: 'Sunrise Mill',
  millCode: 'SRM01',
  address: 'Surat, Gujarat',
  contactPerson: 'Ravi Patel',
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
// GET /api/v1/mills
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mills', () => {
  it('200 — super_admin gets paginated list', async () => {
    db.mill.count.mockResolvedValue(1);
    db.mill.findMany.mockResolvedValue([millData]);

    const res = await request(app)
      .get('/api/v1/mills')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('200 — ?search= filters by millName/millCode', async () => {
    db.mill.count.mockResolvedValue(1);
    db.mill.findMany.mockResolvedValue([millData]);

    const res = await request(app)
      .get('/api/v1/mills?search=Sunrise')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
  });

  it('200 — ?status=inactive filters by status', async () => {
    db.mill.count.mockResolvedValue(0);
    db.mill.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/v1/mills?status=inactive')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('200 — pagination params respected', async () => {
    db.mill.count.mockResolvedValue(25);
    db.mill.findMany.mockResolvedValue([millData]);

    const res = await request(app)
      .get('/api/v1/mills?page=3&limit=5')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.pagination.page).toBe(3);
    expect(res.body.pagination.totalPages).toBe(5);
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .get('/api/v1/mills')
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get('/api/v1/mills');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/v1/mills
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/v1/mills', () => {
  const createPayload = {
    millName: 'Sunrise Mill',
    millCode: 'SRM01',
    address: 'Surat, Gujarat',
    contactPerson: 'Ravi Patel',
    contactNumber: '9876543210',
  };

  it('201 — creates a mill', async () => {
    db.mill.findFirst.mockResolvedValue(null);
    db.mill.create.mockResolvedValue(millData);

    const res = await request(app)
      .post('/api/v1/mills')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.millName).toBe('Sunrise Mill');
  });

  it('409 — duplicate millName returns MILL_NAME_DUPLICATE', async () => {
    db.mill.findFirst.mockResolvedValue(millData);

    const res = await request(app)
      .post('/api/v1/mills')
      .set('Authorization', SUPER_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MILL_NAME_DUPLICATE');
  });

  it('400 — missing millName fails validation', async () => {
    const res = await request(app)
      .post('/api/v1/mills')
      .set('Authorization', SUPER_TOKEN)
      .send({ millCode: 'X' });

    expect(res.status).toBe(400);
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .post('/api/v1/mills')
      .set('Authorization', ADMIN_TOKEN)
      .send(createPayload);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).post('/api/v1/mills').send(createPayload);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/v1/mills/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/v1/mills/:id', () => {
  it('200 — returns a single mill', async () => {
    db.mill.findFirst.mockResolvedValue(millData);

    const res = await request(app)
      .get(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(MILL_ID);
  });

  it('404 — not found returns MILL_NOT_FOUND', async () => {
    db.mill.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/mills/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .get(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).get(`/api/v1/mills/${MILL_ID}`);
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUT /api/v1/mills/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/v1/mills/:id', () => {
  it('200 — updates a mill', async () => {
    db.mill.findFirst.mockResolvedValue(millData);
    db.mill.update.mockResolvedValue({ ...millData, millName: 'Sunrise Mill Updated' });

    const res = await request(app)
      .put(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN)
      .send({ millName: 'Sunrise Mill Updated' });

    expect(res.status).toBe(200);
    expect(res.body.data.millName).toBe('Sunrise Mill Updated');
  });

  it('404 — not found returns MILL_NOT_FOUND', async () => {
    db.mill.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/v1/mills/ghost-id')
      .set('Authorization', SUPER_TOKEN)
      .send({ address: 'New Address' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .put(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', ADMIN_TOKEN)
      .send({ address: 'x' });

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).put(`/api/v1/mills/${MILL_ID}`).send({ address: 'x' });
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DELETE /api/v1/mills/:id
// ═══════════════════════════════════════════════════════════════════════════

describe('DELETE /api/v1/mills/:id', () => {
  it('200 — soft-deletes a mill with no linked records', async () => {
    db.mill.findFirst.mockResolvedValue(millData);
    db.millOutvert.count.mockResolvedValue(0);
    db.millInvert.count.mockResolvedValue(0);
    db.mill.update.mockResolvedValue({ ...millData, deletedAt: new Date() });

    const res = await request(app)
      .delete(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deleted/i);
  });

  it('400 — mill with active outverts returns MILL_IN_USE', async () => {
    db.mill.findFirst.mockResolvedValue(millData);
    db.millOutvert.count.mockResolvedValue(3);
    db.millInvert.count.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MILL_IN_USE');
  });

  it('400 — mill with active inverts returns MILL_IN_USE', async () => {
    db.mill.findFirst.mockResolvedValue(millData);
    db.millOutvert.count.mockResolvedValue(0);
    db.millInvert.count.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MILL_IN_USE');
  });

  it('404 — not found returns MILL_NOT_FOUND', async () => {
    db.mill.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .delete('/api/v1/mills/ghost-id')
      .set('Authorization', SUPER_TOKEN);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('MILL_NOT_FOUND');
  });

  it('403 — admin role returns FORBIDDEN', async () => {
    mockVerify.mockReturnValue({ userId: ADMIN_ID, role: 'admin', email: 'admin@test.com' });

    const res = await request(app)
      .delete(`/api/v1/mills/${MILL_ID}`)
      .set('Authorization', ADMIN_TOKEN);

    expect(res.status).toBe(403);
  });

  it('401 — no auth returns 401', async () => {
    const res = await request(app).delete(`/api/v1/mills/${MILL_ID}`);
    expect(res.status).toBe(401);
  });
});
