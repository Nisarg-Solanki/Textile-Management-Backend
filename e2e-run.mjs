// e2e test runner — Node 22 native fetch + Prisma + jsonwebtoken
// Creates test super admin directly in DB, exercises all 21 API steps, then passes/fails.
// Run: node e2e-run.mjs

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createHmac } from 'crypto';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ── Load .env ──────────────────────────────────────────────────────────────
const envContent = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=\s][^=]*)=["']?(.+?)["']?\s*$/);
  if (match) process.env[match[1].trim()] ??= match[2].trim();
}

const BASE         = 'http://localhost:4000/api/v1';
const JWT_SECRET   = process.env.JWT_ACCESS_SECRET;
const JWT_EXPIRES  = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const TS           = Date.now();

// Unique identifiers for this run
const ADMIN_EMAIL  = `admin.${TS}@textile.test`;
const ADMIN_PASS   = 'AdminPass123!';
const FIRM_NAME    = `E2E Firm ${TS}`;
const FIRM_CODE    = `E${TS}`.slice(0, 20);
const MILL_NAME    = `E2E Mill ${TS}`;
const MILL_CODE    = `M${TS}`.slice(0, 20);
const MACHINE_NO   = `MCH-${TS}`;
const BEAM_NO_1    = `B1-${TS}`;
const BEAM_NO_2    = `B2-${TS}`;
const TAKA_SR_NO   = `T-${TS}`;
const PROD_CHALLAN = `PC-${TS}`.slice(0, 30);
const FIRM_CHALLAN = `FC-${TS}`.slice(0, 30);
const MILL_CHALLAN = `MC-${TS}`.slice(0, 30);

// ── Prisma setup ──────────────────────────────────────────────────────────
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma  = new PrismaClient({ adapter });

// ── Helpers ────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

function check(step, label, condition, detail = '') {
  const icon = condition ? '✅' : '❌';
  if (condition) passed++; else failed++;
  console.log(`${icon} Step ${step}: ${label} — ${condition ? 'PASS' : 'FAIL'}${detail ? ` (${detail})` : ''}`);
  return condition;
}

function signToken(userId, role, email) {
  return jwt.sign({ userId, role, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// ──────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  E2E Test Suite — Textile Management Backend');
  console.log(`  Run ID: ${TS}`);
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Setup: ensure a test super_admin user exists and is active ────────────
  const SUPER_EMAIL = `superadmin-e2e@textile.test`;
  const SUPER_PASS  = 'SuperPass123!';

  const passwordHash = await bcryptjs.hash(SUPER_PASS, 12);
  const superUser = await prisma.user.upsert({
    where: { email: SUPER_EMAIL },
    update: { passwordHash, status: 'active', role: 'super_admin', deletedAt: null },
    create: { name: 'Super Admin E2E', email: SUPER_EMAIL, passwordHash, role: 'super_admin', status: 'active' },
  });
  console.log(`  Setup: super admin upserted (id=${superUser.id})\n`);

  // ── Step 1: Register super admin ──────────────────────────────────────────
  // Super admin already exists → registration should return 409 (idempotent).
  // This verifies the duplicate-email guard.
  let r = await req('POST', '/auth/register', { name: 'Super Admin E2E', email: SUPER_EMAIL, password: SUPER_PASS });
  check(1, 'Register super admin → 409 when email already exists', r.status === 409,
    `status=${r.status} code=${r.data?.code}`);

  // ── Step 2: Login as super admin ──────────────────────────────────────────
  r = await req('POST', '/auth/login', { email: SUPER_EMAIL, password: SUPER_PASS });
  const step2ok = r.status === 200 && r.data?.data?.user?.role === 'super_admin';
  check(2, 'Login as super admin', step2ok, `role=${r.data?.data?.user?.role}`);
  if (!step2ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const superToken = r.data.data.accessToken;

  // ── Step 3: Create a firm (challanEnable: true) ───────────────────────────
  r = await req('POST', '/firms', {
    firmName: FIRM_NAME, firmCode: FIRM_CODE, challanEnable: true,
    address: '123 Test Street', contactPerson: 'Test Person', contactNumber: '9999999999',
  }, superToken);
  const step3ok = r.status === 201 && r.data?.data?.challanEnable === true;
  check(3, 'Create firm (challanEnable: true)', step3ok, `status=${r.status}`);
  if (!step3ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const firmId = r.data.data.id;

  // ── Step 4: Create a mill ─────────────────────────────────────────────────
  r = await req('POST', '/mills', {
    millName: MILL_NAME, millCode: MILL_CODE,
    address: '456 Mill Road', contactPerson: 'Mill Manager', contactNumber: '8888888888',
  }, superToken);
  const step4ok = r.status === 201 && r.data?.data?.millName === MILL_NAME;
  check(4, 'Create mill', step4ok, `status=${r.status}`);
  if (!step4ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const millId = r.data.data.id;

  // ── Step 5: Create a machine ──────────────────────────────────────────────
  r = await req('POST', '/machines', { firmId, machineNo: MACHINE_NO, machineType: 'Rapier', status: 'active' }, superToken);
  const step5ok = r.status === 201 && r.data?.data?.machineNo === MACHINE_NO;
  check(5, 'Create machine', step5ok, `status=${r.status}`);
  if (!step5ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const machineId = r.data.data.id;

  // ── Step 6: Create a beam ─────────────────────────────────────────────────
  r = await req('POST', '/beams', {
    firmId, beamNo: BEAM_NO_1, tar: 200, beamQuality: 'Premium', takaQty: 50, beamMeter: 1200.00,
  }, superToken);
  const step6ok = r.status === 201 && r.data?.data?.beamNo === BEAM_NO_1;
  check(6, 'Create beam', step6ok, `status=${r.status}`);
  if (!step6ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const beamId = r.data.data.id;

  // ── Step 7: Register a regular admin ──────────────────────────────────────
  r = await req('POST', '/auth/register', { name: 'Regular Admin E2E', email: ADMIN_EMAIL, password: ADMIN_PASS });
  const step7ok = r.status === 201 && r.data?.message?.includes('Awaiting');
  check(7, 'Register regular admin (status: pending)', step7ok, `status=${r.status}`);
  if (!step7ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }

  // ── Step 8: Approve the regular admin ─────────────────────────────────────
  r = await req('GET', '/auth/pending-users', null, superToken);
  const pendingAdmin = r.data?.data?.find(u => u.email === ADMIN_EMAIL);
  check('8a', 'List pending users (find regular admin)', r.status === 200 && !!pendingAdmin,
    `found=${!!pendingAdmin}`);
  if (!pendingAdmin) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const adminUserId = pendingAdmin.id;

  r = await req('POST', `/auth/approve-user/${adminUserId}`, null, superToken);
  check('8b', 'Approve regular admin', r.status === 200 && r.data?.success === true, `status=${r.status}`);

  // ── Step 9: Set permissions ───────────────────────────────────────────────
  r = await req('PUT', `/permissions/${adminUserId}`, [
    { module: 'beams',      canView: true, canCreate: true, canEdit: false, canDelete: false },
    { module: 'production', canView: true, canCreate: true, canEdit: true,  canDelete: false },
  ], superToken);
  check(9, 'Set permissions (beams: view+create, production: view+create+edit)', r.status === 200,
    `status=${r.status} count=${r.data?.data?.length}`);
  if (r.status !== 200) { console.log(`   Raw: ${JSON.stringify(r.data)}`); }

  // ── Step 10: Login as regular admin ───────────────────────────────────────
  r = await req('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASS });
  const step10ok = r.status === 200 && r.data?.data?.user?.role === 'admin';
  check(10, 'Login as regular admin', step10ok, `role=${r.data?.data?.user?.role}`);
  if (!step10ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const adminToken = r.data.data.accessToken;

  // ── Step 11: Create beam as regular admin (canCreate=true → 201) ──────────
  r = await req('POST', '/beams', {
    firmId, beamNo: BEAM_NO_2, tar: 150, beamQuality: 'Standard', takaQty: 30, beamMeter: 900.00,
  }, adminToken);
  const step11ok = r.status === 201 && r.data?.data?.beamNo === BEAM_NO_2;
  check(11, 'Create beam as regular admin (canCreate=true → 201)', step11ok, `status=${r.status}`);
  if (!step11ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); }
  const adminBeamId = r.data?.data?.id;

  // ── Step 12: Delete beam as regular admin (canDelete=false → 403) ─────────
  r = await req('DELETE', `/beams/${adminBeamId}`, null, adminToken);
  check(12, 'Delete beam as regular admin (canDelete=false → 403)', r.status === 403,
    `status=${r.status} code=${r.data?.code}`);
  if (r.status !== 403) { console.log(`   Raw: ${JSON.stringify(r.data)}`); }

  // ── Step 13: Create production entry (super admin) ────────────────────────
  r = await req('POST', '/production', {
    firmId, machineId, beamId,
    entryDate: '2024-01-15T10:00:00.000Z',
    takaSrNo: TAKA_SR_NO,
    takaMeter: 25.50,
    productionQuality: 'Premium',
    weight: 12.75,
    productionChallanNo: PROD_CHALLAN,
  }, superToken);
  const step13ok = r.status === 201 && r.data?.data?.takaSrNo === TAKA_SR_NO;
  check(13, 'Create production entry + taka auto-created (Rule 1)', step13ok,
    `status=${r.status} challan=${r.data?.data?.productionChallanNo}`);
  if (!step13ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const productionId = r.data.data.id;

  // ── Step 14: GET takas → verify auto-created taka ─────────────────────────
  r = await req('GET', `/takas?firmId=${firmId}&search=${encodeURIComponent(TAKA_SR_NO)}`, null, superToken);
  const takaFound = r.data?.data?.some(t => t.takaSrNo === TAKA_SR_NO);
  check(14, 'GET takas → auto-created taka exists', r.status === 200 && takaFound,
    `status=${r.status} found=${takaFound} total=${r.data?.pagination?.total}`);
  if (!takaFound) { console.log(`   Raw: ${JSON.stringify(r.data)}`); }

  // ── Step 15: GET machine-info → latest production state ───────────────────
  // Response is flat: { machineNo, takaSrNo, beamNo, takaMeter, entryDate, ... }
  r = await req('GET', `/machine-info?firmId=${firmId}&search=${encodeURIComponent(MACHINE_NO)}`, null, superToken);
  const machineRow = r.data?.data?.find(m => m.machineNo === MACHINE_NO);
  const step15ok = r.status === 200 && !!machineRow && machineRow.takaSrNo === TAKA_SR_NO;
  check(15, 'GET machine-info → machine shows latest production entry', step15ok,
    `status=${r.status} takaSrNo=${machineRow?.takaSrNo}`);
  if (!step15ok) { console.log(`   MachineRow: ${JSON.stringify(machineRow)}`); }

  // ── Step 16: Create mill outvert ──────────────────────────────────────────
  r = await req('POST', '/mill-outverts', {
    firmId, millId,
    outvertDate: '2024-01-20T08:00:00.000Z',
    firmChallanNo: FIRM_CHALLAN,
    takaSrNos: [TAKA_SR_NO],
  }, superToken);
  const step16ok = r.status === 201 && r.data?.data?.firmChallanNo === FIRM_CHALLAN;
  check(16, 'Create mill outvert (taka sent to mill, ProductionInfo synced)', step16ok, `status=${r.status}`);
  if (!step16ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const outvertId = r.data.data.id;

  // ── Step 17: GET production/:id → verify millOutvertDate + millName ────────
  r = await req('GET', `/production/${productionId}`, null, superToken);
  const prod17 = r.data?.data;
  const step17ok = r.status === 200 && !!prod17?.millOutvertDate && prod17?.millName === MILL_NAME && prod17?.millOutvertId === outvertId;
  check(17, 'GET production/:id → millOutvertDate + millName synced after outvert', step17ok,
    `millOutvertDate=${!!prod17?.millOutvertDate} millName="${prod17?.millName}"`);
  if (!step17ok) { console.log(`   Raw: ${JSON.stringify({ millOutvertDate: prod17?.millOutvertDate, millName: prod17?.millName, millOutvertId: prod17?.millOutvertId })}`); }

  // ── Step 18: Create mill invert ───────────────────────────────────────────
  r = await req('POST', '/mill-inverts', {
    firmId, millId,
    millOutvertId: outvertId,
    invertDate: '2024-02-01T09:00:00.000Z',
    millChallanNo: MILL_CHALLAN,
    firmChallanNo: FIRM_CHALLAN,
    takaSrNos: [TAKA_SR_NO],
  }, superToken);
  const step18ok = r.status === 201 && r.data?.data?.millChallanNo === MILL_CHALLAN;
  check(18, 'Create mill invert (taka returned, ProductionInfo synced)', step18ok, `status=${r.status}`);
  if (!step18ok) { console.log(`   Raw: ${JSON.stringify(r.data)}`); process.exit(1); }
  const invertId = r.data.data.id;

  // ── Step 19: GET production/:id → verify millChallanNo ────────────────────
  r = await req('GET', `/production/${productionId}`, null, superToken);
  const prod19 = r.data?.data;
  const step19ok = r.status === 200 && prod19?.millChallanNo === MILL_CHALLAN && prod19?.millInvertId === invertId;
  check(19, 'GET production/:id → millChallanNo synced after invert', step19ok,
    `millChallanNo="${prod19?.millChallanNo}" millInvertId=${!!prod19?.millInvertId}`);
  if (!step19ok) { console.log(`   Raw: ${JSON.stringify({ millChallanNo: prod19?.millChallanNo, millInvertId: prod19?.millInvertId })}`); }

  // ── Step 20: GET mill-summary?status=returned ─────────────────────────────
  r = await req('GET', `/mill-summary?status=returned&firmId=${firmId}&search=${encodeURIComponent(TAKA_SR_NO)}`, null, superToken);
  const summaryRow = r.data?.data?.find(row => row.takaSrNo === TAKA_SR_NO);
  check(20, 'GET mill-summary?status=returned → taka appears as returned', r.status === 200 && !!summaryRow && !!summaryRow.millInvertId,
    `status=${r.status} found=${!!summaryRow} hasInvert=${!!summaryRow?.millInvertId}`);
  if (!summaryRow) { console.log(`   Raw: ${JSON.stringify(r.data?.data?.slice(0,2))}`); }

  // ── Step 21: GET api-docs.json ────────────────────────────────────────────
  r = await req('GET', '/api-docs.json', null, null);
  const spec = r.data;
  const step21ok = r.status === 200 && spec?.openapi === '3.0.0' && typeof spec?.paths === 'object' && Object.keys(spec.paths).length > 0;
  check(21, 'GET api-docs.json → valid OpenAPI 3.0 spec with routes', step21ok,
    `openapi=${spec?.openapi} paths=${Object.keys(spec?.paths ?? {}).length}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async err => {
  console.error('Unhandled error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
