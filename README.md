# Textile Production Management System — Backend

REST API for managing textile production across multiple firms.
Built with Node.js 22, Express 5, Prisma 7, PostgreSQL 17, and TypeScript.

---

## What this system does

A multi-firm production management platform for textile businesses. Each firm tracks:

- **Beams** — raw material units (yarn spools)
- **Production Info** — per-machine production records (auto-creates Taka entries)
- **Takas** — fabric rolls, auto-generated from production records
- **Mill Outvert / Invert** — fabric dispatched to mills and received back
- **Machine Info** — live auto-generated machine status view
- **Mill Summary** — consolidated view of each Taka's mill journey
- **Beam Qualities / Production Qualities** — reusable quality master lists
- **Dashboard** — aggregate stats + time-bucketed production charts

Admin modules: Firm Management, Mill Management, Machine Management, Quality Masters, User & Permission Management.

---

## Tech stack

| Layer      | Choice                                                        |
| ---------- | ------------------------------------------------------------- |
| Runtime    | Node.js 22 LTS                                                |
| Language   | TypeScript 5.8 (strict mode)                                  |
| Framework  | Express 5                                                     |
| ORM        | Prisma 7                                                      |
| Database   | PostgreSQL 17 (local dev) / Neon (production)                 |
| Validation | Zod 3                                                         |
| Auth       | JWT — access token (15m) + refresh token (7d httpOnly cookie) |
| API Docs   | swagger-jsdoc + swagger-ui-express                            |
| Testing    | Jest 30 + ts-jest + Supertest                                 |
| Dev server | ts-node-dev                                                   |

---

## Prerequisites

Make sure these are installed before you begin:

- [Node.js 22 LTS](https://nodejs.org/en/download) — download the LTS installer for Windows
- [PostgreSQL 17](https://www.postgresql.org/download/windows/) — run the installer, keep defaults, set a password for the `postgres` user
- [Git](https://git-scm.com/download/win)

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/your-username/textile-backend.git
cd textile-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
copy .env.example .env
```

Open `.env` and fill in your values:

```env
# Local PostgreSQL — replace yourpassword with what you set during PostgreSQL install
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/textile_db"

# Generate two separate random strings for these (run in browser console: crypto.randomUUID())
JWT_ACCESS_SECRET="paste-a-random-string-here-min-32-chars"
JWT_REFRESH_SECRET="paste-a-different-random-string-here"

JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=4000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# Comma-separated emails that are auto-approved as super_admin on registration
SUPER_ADMIN_EMAILS="you@example.com"

# SMTP for approval/reset emails (Gmail example)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=465
SMTP_USER="your@gmail.com"
SMTP_PASS="your-app-password"
```

### 4. Run database migrations

This creates all tables in your local PostgreSQL database:

```bash
npx prisma migrate dev --name init
```

You should see output like:

```
✔ Generated Prisma Client
The following migration(s) have been applied:
  migrations/20240101000000_init/migration.sql
```

### 5. Seed the super admin user

```bash
npx prisma db seed
```

This creates a `super_admin` user for each email listed in `SUPER_ADMIN_EMAILS` with the default password `Admin@1234`. Change the password immediately after first login.

### 6. Start the development server

```bash
npm run dev
```

The server watches all `.ts` files and auto-restarts on every save.

```
Server running on port 4000
```

### 7. Verify it's working

Open these in your browser:

| URL                                          | Expected                               |
| -------------------------------------------- | -------------------------------------- |
| `http://localhost:4000/api/v1/health`        | `{ "success": true, "message": "OK" }` |
| `http://localhost:4000/api/v1/api-docs`      | Swagger UI — interactive API docs      |
| `http://localhost:4000/api/v1/api-docs.json` | Raw OpenAPI JSON spec                  |

---

## Available scripts

```bash
npm run dev            # Start dev server with hot reload (ts-node-dev)
npm run build          # Compile TypeScript to dist/
npm run start          # Run compiled output (production)
npm run lint           # Check for lint errors
npm run lint:fix       # Auto-fix lint errors where possible
```

```bash
npm test               # Run all tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage report
```

```bash
npx prisma migrate dev --name <migration-name>   # Apply schema changes to local DB
npx prisma migrate deploy                         # Apply all migrations to production (Neon)
npx prisma generate                               # Regenerate Prisma client after schema change
npx prisma studio                                 # Open visual DB browser at localhost:5555
npx prisma db seed                                # Seed the first super_admin user
```

---

## Project structure

```
backend/
├── src/
│   ├── index.ts               # Entry point — starts Express server
│   ├── app.ts                 # Express setup — middleware, routes, swagger
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification — attaches req.user
│   │   └── permission.ts      # requirePermission(module, action) — super_admin bypasses; admin checks AdminPermission
│   ├── routes/
│   │   ├── auth.ts            # Login, refresh, logout, register, forgot/reset-password, user management
│   │   ├── firms.ts           # CRUD — GET open to all auth'd users; writes super_admin only (assertSuperAdmin)
│   │   ├── mills.ts           # CRUD — GET open to all auth'd users; writes super_admin only (assertSuperAdmin)
│   │   ├── permissions.ts     # GET/PUT module permissions per admin (GET allowed for self)
│   │   ├── beamQualities.ts   # CRUD — permission-gated
│   │   ├── productionQualities.ts # CRUD — permission-gated
│   │   ├── machines.ts        # CRUD — permission-gated
│   │   ├── beams.ts           # CRUD — permission-gated (supports ?getAll=true)
│   │   ├── production.ts      # CRUD — auto-creates Taka atomically
│   │   ├── takas.ts           # GET only — supports ?status=not_sent|at_mill|returned
│   │   ├── millOutverts.ts    # CRUD — syncs ProductionInfo fields
│   │   ├── millInverts.ts     # CRUD — syncs ProductionInfo fields
│   │   ├── machineInfo.ts     # GET only — auto-generated machine status view
│   │   ├── millSummary.ts     # GET only — consolidated Taka mill journey view
│   │   └── dashboard.ts       # GET /dashboard/stats, /dashboard/production-chart
│   ├── schemas/               # Zod validation schemas per module
│   ├── services/              # Business logic (atomic transactions)
│   │   ├── production.service.ts
│   │   ├── millOutvert.service.ts
│   │   └── millInvert.service.ts
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── jwt.ts             # signToken / verifyToken helpers
│   │   ├── errors.ts          # AppError class + global error handler
│   │   ├── mailer.ts          # nodemailer — approval, reset, and approved emails
│   │   └── superAdmin.ts      # getSuperAdminEmails() / isSuperAdminEmail()
│   └── tests/
│       ├── setup.ts           # Seeds process.env for all test files
│       ├── tsconfig.json      # Extends tsconfig.test.json — adds jest + node types
│       ├── auth.test.ts
│       ├── beams.test.ts
│       ├── firms.test.ts
│       ├── machineInfo.test.ts
│       ├── machines.test.ts
│       ├── millInverts.test.ts
│       ├── millOutverts.test.ts
│       ├── millSummary.test.ts
│       ├── mills.test.ts
│       ├── permissions.test.ts
│       ├── production.test.ts
│       ├── beamQualities.test.ts
│       ├── productionQualities.test.ts
│       └── takas.test.ts
├── prisma/
│   ├── schema.prisma          # Database schema
│   ├── seed.ts                # Seed script — run via `npx prisma db seed`
│   └── migrations/            # Auto-generated SQL migration history (includes partial unique indexes)
├── prisma.config.ts           # Prisma v7 datasource config (DATABASE_URL)
├── jest.config.ts             # Jest config — ts-jest preset, node environment
├── eslint.config.mjs          # ESLint flat config — TypeScript rules
├── .env                       # Local environment variables (not in Git)
├── .env.example               # Template — copy this to .env
├── tsconfig.json              # Production/dev config — module: NodeNext
├── tsconfig.test.json         # Test overrides — module: CommonJS (required by Jest)
└── package.json
```

---

## API overview

All routes are prefixed with `/api/v1`. Protected routes require:

```
Authorization: Bearer <accessToken>
```

### Auth (public)

| Method | Endpoint                | Description                                                         |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| POST   | `/auth/register`        | Register — auto-approved if super_admin email, else status: pending |
| POST   | `/auth/login`           | Login with email + password                                         |
| POST   | `/auth/refresh`         | Get new access token using refresh cookie                           |
| POST   | `/auth/logout`          | Clear refresh token cookie                                          |
| POST   | `/auth/forgot-password` | Send password reset link (always returns 200)                       |
| POST   | `/auth/reset-password`  | Reset password via one-time token                                   |

### Auth (super_admin only)

| Method | Endpoint                 | Description                                  |
| ------ | ------------------------ | -------------------------------------------- |
| GET    | `/auth/users`            | Paginated list of all users                  |
| POST   | `/auth/users`            | Create user directly — always status: active |
| GET    | `/auth/pending-users`    | List all pending registrations               |
| POST   | `/auth/approve-user/:id` | Approve a pending user                       |
| POST   | `/auth/reject-user/:id`  | Reject (soft-delete) a pending user          |
| DELETE | `/auth/users/:id`        | Soft-delete admin (blocks self + super_admin targets) |

### Permissions

| Method | Endpoint                | Description                                                |
| ------ | ----------------------- | ---------------------------------------------------------- |
| GET    | `/permissions/:adminId` | Get all module permissions (super_admin OR the admin self) |
| PUT    | `/permissions/:adminId` | Replace all module permissions (super_admin only)          |

### Dashboard

| Method | Endpoint                       | Description                                                |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| GET    | `/dashboard/stats`             | totalBeams, productionEntries, pendingTakas + WoW change   |
| GET    | `/dashboard/production-chart`  | Time-series by `?type=daily\|weekly\|monthly`              |

### Firm & Mill management

GET endpoints are open to any authenticated user (so admins can populate firm/mill pickers).
POST / PUT / DELETE are restricted to `super_admin` via an in-handler `assertSuperAdmin()` check.

| Method         | Endpoint     | Description                                                            |
| -------------- | ------------ | ---------------------------------------------------------------------- |
| GET            | `/firms`     | List firms (any auth'd user)                                           |
| POST           | `/firms`     | Create firm (super_admin)                                              |
| GET            | `/firms/:id` | Get firm (any auth'd user)                                             |
| PUT/DELETE     | `/firms/:id` | Update / soft-delete firm (super_admin) — delete blocked if in use     |
| GET            | `/mills`     | List mills (any auth'd user)                                           |
| POST           | `/mills`     | Create mill (super_admin)                                              |
| GET            | `/mills/:id` | Get mill (any auth'd user)                                             |
| PUT/DELETE     | `/mills/:id` | Update / soft-delete mill (super_admin)                                |

### Data routes (permission-gated)

All data routes accept an optional `?firmId=` query param to filter by firm.
Access is gated by the `AdminPermission` table — super_admin bypasses all checks.

| Module               | Endpoints                          | Notes                                                          |
| -------------------- | ---------------------------------- | -------------------------------------------------------------- |
| Beam Qualities       | `/beam-qualities` — full CRUD      | Delete blocked if linked to any beam                           |
| Production Qualities | `/production-qualities` — full CRUD| Delete blocked if linked to any production record              |
| Machines             | `/machines` — full CRUD            | `machine_no` unique per firm                                   |
| Beams                | `/beams` — full CRUD               | `beam_no` globally unique; firmId auto-filled on first prod    |
| Production Info      | `/production` — full CRUD          | Auto-creates Taka atomically; enforces total meter ≤ beamMeter |
| Takas                | `/takas` — GET only                | Auto-generated; `?status=not_sent\|at_mill\|returned`          |
| Mill Outverts        | `/mill-outverts` — full CRUD       | Syncs mill fields in Production Info                           |
| Mill Inverts         | `/mill-inverts` — full CRUD        | Syncs mill fields in Production Info                           |
| Machine Info         | `/machine-info` — GET only         | Auto-generated machine status view                             |
| Mill Summary         | `/mill-summary` — GET only         | Taka mill journey view, grouped by firm challan                |

### Search and filters

Every list endpoint accepts:

```
?search=     — searches all text columns (ILIKE)
?firmId=     — filter by firm
?page=1      — page number (default: 1)
?limit=20    — results per page (default: 20, max: 100)
```

Module-specific filters:

| Module                | Extra filters                                                        |
| --------------------- | -------------------------------------------------------------------- |
| Beams                 | `?qualityId=` `?meter_min=` `?meter_max=` `?getAll=true`             |
| Production Info       | `?machine=` `?beam=` `?date_from=` `?date_to=` `?qualityId=`         |
| Takas                 | `?beam_no=` `?meter_min=` `?meter_max=` `?status=`                   |
| Machine Info          | `?machine_no=`                                                       |
| Mill Outverts/Inverts | `?mill=` `?date_from=` `?date_to=`                                   |
| Mill Summary          | `?mill=` `?status=` `?date_from=` `?date_to=`                        |

See full interactive docs at `http://localhost:4000/api/v1/api-docs` when running locally.

---

## Testing

Tests use **Jest + Supertest** and run against a fully mocked Prisma client — no real database connection needed.

```bash
npm test                        # run all tests once
npm run test:watch              # watch mode — re-runs on file save
npm run test:coverage           # run with coverage report
npm test -- auth                # run a single file by name fragment
```

All test files live in `src/tests/`. Each file covers one route module.
The `src/tests/setup.ts` file seeds all required `process.env` values — no `.env` file is read during tests.

---

## Database

### Tables (15 total)

| Table                   | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `firms`                 | Registered textile firms                                      |
| `mills`                 | External processing mills                                     |
| `machines`              | Machines per firm (`machine_no` unique per firm)              |
| `beam_qualities`        | Reusable beam quality master                                  |
| `beams`                 | Raw material beams (`beam_no` globally unique)                |
| `production_qualities`  | Reusable production quality master                            |
| `production_info`       | Central production records (`taka_sr_no` unique per firm)     |
| `takas`                 | Auto-generated from production_info                           |
| `mill_outverts`         | Fabric dispatch to mills (`firm_challan_no` unique per firm)  |
| `mill_outvert_takas`    | Junction — one outvert, many Takas                            |
| `mill_inverts`          | Fabric receipt from mills (`mill_challan_no` unique globally) |
| `mill_invert_takas`     | Junction — one invert, many Takas                             |
| `users`                 | Auth users (`email` unique globally)                          |
| `admin_permissions`     | Module-level permissions per admin user                       |
| `password_reset_tokens` | One-time tokens for password reset flow                       |

### Key constraints

- `machine_no` — unique per firm
- `beam_no` — globally unique (among non-deleted rows)
- `taka_sr_no` — unique per firm
- `taka_no` — unique per beam (nullable, but required by the create schema)
- `firm_challan_no` — unique per firm (both mill_outverts and mill_inverts)
- `mill_challan_no` — globally unique (among non-deleted rows)
- Soft-delete-aware uniqueness — most unique constraints are partial indexes
  (`WHERE deleted_at IS NULL`), so a soft-deleted row never blocks recreation.
  Services pre-check duplicates with `findFirst` — do NOT rely on Prisma's P2002.
- All tables use soft delete (`deleted_at`) — no records are permanently removed
  (exceptions: `admin_permissions` and `password_reset_tokens` are hard-deleted)

### Switching to production (Neon)

When ready to deploy, update only `DATABASE_URL` in your environment:

```env
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
```

Then run:

```bash
npx prisma migrate deploy
```

Prisma applies only the migrations Neon hasn't seen yet. Nothing else changes in your code.

---

## Generating frontend TypeScript types

The backend exposes its OpenAPI spec at `/api/v1/api-docs.json`.
Run this from the frontend project to auto-generate all API types:

```bash
npx openapi-typescript http://localhost:4000/api/v1/api-docs.json -o src/types/api.d.ts
```

Add as a script in the frontend `package.json`:

```json
"generate:types": "openapi-typescript http://localhost:4000/api/v1/api-docs.json -o src/types/api.d.ts"
```

Re-run any time you add or change a backend route.

---

## Environment variables reference

| Variable                 | Description                                                        | Example                                                |
| ------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| `DATABASE_URL`           | PostgreSQL connection string                                       | `postgresql://postgres:pass@localhost:5432/textile_db` |
| `JWT_ACCESS_SECRET`      | Secret for signing access tokens (min 32 chars)                    | random string                                          |
| `JWT_REFRESH_SECRET`     | Secret for signing refresh tokens — must differ from access secret | random string                                          |
| `JWT_ACCESS_EXPIRES_IN`  | Access token lifetime                                              | `15m`                                                  |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime                                             | `7d`                                                   |
| `PORT`                   | Port the server listens on                                         | `4000`                                                 |
| `NODE_ENV`               | Environment — affects error detail and cookie security             | `development` or `production`                          |
| `FRONTEND_URL`           | Allowed CORS origin + used in email links                          | `http://localhost:3000`                                |
| `SUPER_ADMIN_EMAILS`     | Comma-separated emails auto-approved as super_admin                | `admin@example.com`                                    |
| `SMTP_HOST`              | SMTP server host                                                   | `smtp.gmail.com`                                       |
| `SMTP_PORT`              | SMTP server port                                                   | `587`                                                  |
| `SMTP_USER`              | SMTP login email                                                   | `your@gmail.com`                                       |
| `SMTP_PASS`              | SMTP password or app password                                      | `xxxx xxxx xxxx xxxx`                                  |

---

## Notes for Claude Code

This repo contains a `CLAUDE.md` file in the `backend/` directory with full project context —
schema, routes, business rules, naming conventions, and patterns.
Claude Code reads this automatically at the start of every session.
Do not delete or rename `CLAUDE.md`.
