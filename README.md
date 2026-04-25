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

Admin modules: Firm Management, Mill Management, Machine Management.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 22 LTS |
| Language | TypeScript 5.8 (strict mode) |
| Framework | Express 5 |
| ORM | Prisma 7 |
| Database | PostgreSQL 17 (local dev) / Neon (production) |
| Validation | Zod 3 |
| Auth | JWT — access token (15m) + refresh token (7d httpOnly cookie) |
| API Docs | swagger-jsdoc + swagger-ui-express |
| Dev server | ts-node-dev |

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
```

### 4. Run database migrations

This creates all 11 tables in your local PostgreSQL database:

```bash
npx prisma migrate dev --name init
```

You should see output like:
```
✔ Generated Prisma Client
The following migration(s) have been applied:
  migrations/20240101000000_init/migration.sql
```

### 5. Seed the first admin user

```bash
npx prisma db seed
```

This creates:
- **Email:** `admin@textile.com`
- **Password:** `Admin@1234`

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

| URL | Expected |
|---|---|
| `http://localhost:4000/api/v1/health` | `{ "success": true, "message": "OK" }` |
| `http://localhost:4000/api/v1/api-docs` | Swagger UI — interactive API docs |
| `http://localhost:4000/api/v1/api-docs.json` | Raw OpenAPI JSON spec |

---

## Available scripts

```bash
npm run dev        # Start dev server with hot reload (ts-node-dev)
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled output (production)
```

```bash
npx prisma migrate dev --name <migration-name>   # Apply schema changes to local DB
npx prisma migrate deploy                         # Apply all migrations to production (Neon)
npx prisma generate                               # Regenerate Prisma client after schema change
npx prisma studio                                 # Open visual DB browser at localhost:5555
npx prisma db seed                                # Run the seed file
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
│   │   └── firmScope.ts       # Firm isolation — blocks cross-firm access
│   ├── routes/
│   │   ├── auth.ts            # POST /auth/login, /refresh, /logout
│   │   ├── firms.ts           # CRUD — admin only
│   │   ├── mills.ts           # CRUD — admin only
│   │   ├── machines.ts        # CRUD — firm-scoped
│   │   ├── beams.ts           # CRUD — firm-scoped
│   │   ├── production.ts      # CRUD — firm-scoped, auto-creates Taka
│   │   ├── takas.ts           # GET only — auto-generated view
│   │   ├── millOutverts.ts    # CRUD — firm-scoped
│   │   ├── millInverts.ts     # CRUD — firm-scoped
│   │   ├── machineInfo.ts     # GET only — auto-generated view
│   │   └── millSummary.ts     # GET only — consolidated mill view
│   ├── schemas/               # Zod validation schemas per module
│   ├── services/              # Business logic (atomic transactions)
│   │   ├── production.service.ts
│   │   ├── millOutvert.service.ts
│   │   └── millInvert.service.ts
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton
│   │   ├── jwt.ts             # signToken / verifyToken helpers
│   │   └── errors.ts          # AppError class + global error handler
│   └── types/
│       └── express.d.ts       # Extends Express Request with req.user
├── prisma/
│   ├── schema.prisma          # Database schema — 11 tables
│   ├── migrations/            # Auto-generated SQL migration history
│   └── seed.ts                # Seeds the first admin user
├── .env                       # Local environment variables (not in Git)
├── .env.example               # Template — copy this to .env
├── .gitignore
├── tsconfig.json
└── package.json
```

---

## API overview

All routes are prefixed with `/api/v1`. Protected routes require:
```
Authorization: Bearer <accessToken>
```

### Auth (public)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/login` | Login with email + password |
| POST | `/auth/refresh` | Get new access token using refresh cookie |
| POST | `/auth/logout` | Clear refresh token cookie |

### Admin routes (require role: admin)

| Method | Endpoint | Description |
|---|---|---|
| GET/POST | `/firms` | List / create firms |
| GET/PUT/DELETE | `/firms/:id` | Get / update / delete firm |
| GET/POST | `/mills` | List / create mills |
| GET/PUT/DELETE | `/mills/:id` | Get / update / delete mill |

### Firm-scoped routes (all under `/firms/:firmId/`)

| Module | Endpoints | Notes |
|---|---|---|
| Machines | `/machines` — full CRUD | `machine_no` unique per firm |
| Beams | `/beams` — full CRUD | `beam_no` unique per firm |
| Production Info | `/production` — full CRUD | Auto-creates Taka on save |
| Takas | `/takas` — GET only | Auto-generated, no create/edit |
| Mill Outverts | `/mill-outverts` — full CRUD | Syncs Mill fields in Production Info |
| Mill Inverts | `/mill-inverts` — full CRUD | Syncs Mill fields in Production Info |
| Machine Info | `/machine-info` — GET only | Auto-generated machine status |
| Mill Summary | `/mill-summary` — GET only | Taka mill journey view |

### Search and filters

Every list endpoint accepts:

```
?search=     — searches all text columns (ILIKE)
?page=1      — page number (default: 1)
?limit=20    — results per page (default: 20, max: 100)
```

Module-specific filters:

| Module | Extra filters |
|---|---|
| Beams | `?quality=` `?meter_min=` `?meter_max=` |
| Production Info | `?machine=` `?beam=` `?date_from=` `?date_to=` `?quality=` |
| Mill Outverts/Inverts | `?mill=` `?date_from=` `?date_to=` |
| Mill Summary | `?mill=` `?status=sent\|returned\|pending` `?date_from=` `?date_to=` |

See full interactive docs at `http://localhost:4000/api/v1/api-docs` when running locally.

---

## Database

### Tables (11 total)

| Table | Purpose |
|---|---|
| `firms` | Registered textile firms |
| `mills` | External processing mills |
| `machines` | Machines per firm (`machine_no` unique per firm) |
| `beams` | Raw material beams (`beam_no` unique per firm) |
| `production_info` | Central production records (`taka_sr_no` unique per firm) |
| `takas` | Auto-generated from production_info |
| `mill_outverts` | Fabric dispatch to mills (`firm_challan_no` unique per firm) |
| `mill_outvert_takas` | Junction — one outvert, many Takas |
| `mill_inverts` | Fabric receipt from mills (`mill_challan_no` unique globally) |
| `mill_invert_takas` | Junction — one invert, many Takas |
| `users` | Auth users (`email` unique globally) |

### Key constraints

- `machine_no` — unique per firm
- `beam_no` — unique per firm
- `taka_sr_no` — unique per firm
- `firm_challan_no` — unique per firm
- `mill_challan_no` — unique globally
- `updated_at` — auto-updated by Prisma on every record change
- All tables use soft delete (`deleted_at`) — no records are permanently removed

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

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:pass@localhost:5432/textile_db` |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens (min 32 chars) | random string |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens — must differ from access secret | random string |
| `JWT_ACCESS_EXPIRES_IN` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token lifetime | `7d` |
| `PORT` | Port the server listens on | `4000` |
| `NODE_ENV` | Environment — affects error detail and cookie security | `development` or `production` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:3000` |

---

## Default admin credentials

Seeded by `npx prisma db seed`:

```
Email:    admin@textile.com
Password: Admin@1234
```

Change the password immediately after first login in production.

---

## Notes for Claude Code

This repo contains a `CLAUDE.md` file at the root with full project context —
schema, routes, business rules, naming conventions, and patterns.
Claude Code reads this automatically at the start of every session.
Do not delete or rename `CLAUDE.md`.
