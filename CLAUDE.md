# CLAUDE.md — Textile Production Management System (Backend)

> Read this file fully before writing any code.
> This is the single source of truth for the entire backend.

---

## 1. Project Overview

A textile production management system. Firms manage beams, production records,
taka (fabric rolls), mill dispatch/receipt operations, and machine status tracking.

**Roles:** Two roles only — `super_admin` and `admin`.

- `super_admin` — identified by `SUPER_ADMIN_EMAILS` env var; approves/rejects new admin registrations; assigns module-level permissions to each admin; has full access to everything.
- `admin` — registered and approved by super_admin; access is limited to the modules and actions (view/create/edit/delete) that super_admin has explicitly granted.

Data records (machines, beams, production, etc.) still carry a `firmId` as a data attribute for grouping/filtering, but user access is NOT locked to a firm — both roles can view data across all firms.

---

## 2. Tech Stack

| Layer       | Choice                                                       |
| ----------- | ------------------------------------------------------------ |
| Runtime     | Node.js 22 LTS                                               |
| Language    | TypeScript (strict mode)                                     |
| Framework   | Express.js                                                   |
| ORM         | Prisma                                                       |
| Validation  | Zod (all request bodies and query params)                    |
| Auth        | JWT — jsonwebtoken + bcryptjs                                |
| Database    | PostgreSQL 17 — local during development, Neon in production |
| Dev server  | ts-node-dev                                                  |
| Environment | dotenv                                                       |
| Linting     | ESLint v9 + typescript-eslint v8 (flat config)               |
| Testing     | Jest v30 + ts-jest + Supertest (unit + integration)          |

**Do NOT suggest switching frameworks, ORMs, or validation libraries mid-task.**
**Do NOT use `any` type in TypeScript. Always type everything explicitly.**

---

## 3. Folder Structure

```
backend/
├── src/
│   ├── index.ts               # App entry point — starts Express server, loads dotenv
│   ├── app.ts                 # Express app setup — middleware, routes, swagger mounted here
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification — attaches req.user to every protected request
│   │   └── permission.ts      # requirePermission(module, action) — super_admin bypasses; admin checks AdminPermission
│   ├── types/
│   │   └── express.d.ts       # Augments Express.Request with `user?: { userId, role, email }`
│   ├── routes/
│   │   ├── auth.ts            # POST /api/v1/auth/login, /refresh, /logout, /register,
│   │   │                      # /forgot-password, /reset-password,
│   │   │                      # GET /users, POST /users (super_admin),
│   │   │                      # GET /pending-users (super_admin),
│   │   │                      # POST /approve-user/:id, /reject-user/:id (super_admin)
│   │   │                      # DELETE /users/:id (super_admin — soft delete admin; blocked for super_admin targets and self)
│   │   ├── firms.ts           # CRUD for firms — GET open to all auth'd users; POST/PUT/DELETE super_admin-only via assertSuperAdmin()
│   │   ├── mills.ts           # CRUD for mills — same pattern as firms (assertSuperAdmin in handler, no requirePermission)
│   │   ├── beamQualities.ts   # CRUD for beam_qualities — /api/v1/beam-qualities
│   │   ├── productionQualities.ts # CRUD for production_qualities — /api/v1/production-qualities
│   │   ├── machines.ts        # CRUD for machines — /api/v1/machines
│   │   ├── beams.ts           # CRUD for beams — /api/v1/beams (supports ?getAll=true for unpaginated)
│   │   ├── production.ts      # CRUD for production_info — /api/v1/production (delegates writes to service)
│   │   ├── takas.ts           # GET only (view) — /api/v1/takas (supports ?status=not_sent|at_mill|returned)
│   │   ├── millOutverts.ts    # CRUD for mill_outverts — /api/v1/mill-outverts (delegates to service)
│   │   ├── millInverts.ts     # CRUD for mill_inverts — /api/v1/mill-inverts (delegates to service)
│   │   ├── machineInfo.ts     # GET only (view) — /api/v1/machine-info
│   │   ├── millSummary.ts     # GET only (view) — /api/v1/mill-summary (grouped by firm challan)
│   │   ├── dashboard.ts       # GET /api/v1/dashboard/stats, /production-chart
│   │   └── permissions.ts     # GET /api/v1/permissions/:adminId (super_admin or self),
│   │                          # PUT /api/v1/permissions/:adminId (super_admin only)
│   ├── schemas/
│   │   ├── auth.schema.ts
│   │   ├── firm.schema.ts
│   │   ├── mill.schema.ts
│   │   ├── beamQuality.schema.ts
│   │   ├── productionQuality.schema.ts
│   │   ├── machine.schema.ts
│   │   ├── beam.schema.ts
│   │   ├── production.schema.ts
│   │   ├── millOutvert.schema.ts
│   │   ├── millInvert.schema.ts
│   │   ├── dashboard.schema.ts
│   │   └── permission.schema.ts
│   ├── services/
│   │   ├── production.service.ts   # createProductionEntry / updateProductionEntry — atomic ProductionInfo+Taka writes
│   │   │                           # Defines productionInclude const + ProductionWithRelations type
│   │   │                           # Also enforces takaNo unique per beam, total taka meter ≤ beam meter,
│   │   │                           # and auto-fills Beam.firmId on first production use
│   │   ├── millOutvert.service.ts  # createMillOutvert / updateMillOutvert / deleteMillOutvert
│   │   │                           # Defines millOutvertInclude const + MillOutvertWithRelations type
│   │   └── millInvert.service.ts   # createMillInvert / updateMillInvert / deleteMillInvert
│   │                               # Defines millInvertInclude const + MillInvertWithRelations type
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton — uses PrismaPg adapter; cached on globalThis in dev
│   │   ├── jwt.ts             # signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken
│   │   ├── errors.ts          # AppError class + global errorHandler (handles AppError, ZodError, Prisma P2002/P2025)
│   │   ├── mailer.ts          # Gmail API (googleapis OAuth2) — sendApprovalRequestEmail, sendPasswordResetEmail, sendAccountApprovedEmail
│   │   └── superAdmin.ts      # getSuperAdminEmails(), isSuperAdminEmail() — reads SUPER_ADMIN_EMAILS env var
│   └── tests/
│       ├── setup.ts           # Jest global setup — seeds process.env for all test files
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
│   ├── schema.prisma
│   ├── seed.ts                # Seed script — run via `npx prisma db seed`
│   └── migrations/            # Includes a partial-unique-indexes migration that replaces
│                              # most `@unique`/`@@unique` constraints with `CREATE UNIQUE INDEX ...
│                              # WHERE "deletedAt" IS NULL` so soft-deleted rows don't block recreation
├── e2e-setup.mjs              # End-to-end test setup helper
├── e2e-run.mjs                # End-to-end test runner
├── prisma.config.ts           # Prisma v7 datasource config — DATABASE_URL lives here
├── jest.config.ts             # Jest config — ts-jest preset, points to tsconfig.test.json
├── eslint.config.mjs          # ESLint flat config — TypeScript rules
├── .env
├── .env.example
├── tsconfig.json              # Production/dev TypeScript config — module: NodeNext
├── tsconfig.seed.json         # Seed script override — CommonJS for ts-node compatibility
├── tsconfig.test.json         # Test-only overrides — module: CommonJS (required by Jest)
└── package.json
```

---

## 4. Environment Variables

```env
# .env.example — copy to .env and fill in values

# LOCAL development (PostgreSQL 17 installed locally via postgresql.org installer)
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/textile_db"

# PRODUCTION (swap this in when deploying to Neon — only change this one line)
# DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
JWT_ACCESS_SECRET="min-32-char-random-string"
JWT_REFRESH_SECRET="different-min-32-char-random-string"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=4000
NODE_ENV="development"
FRONTEND_URL="http://localhost:3000"

# Super admin emails — comma-separated, max 2.
# Registrants with these emails are auto-approved as role: "admin".
# If NO user with these emails exists in the DB yet, the very first registrant
# is auto-approved regardless of email (first-time setup).
SUPER_ADMIN_EMAILS="admin1@example.com,admin2@example.com"

# Gmail API OAuth2 — used for approval request emails, password reset emails, and account approved emails
CLIENT_ID="your-google-oauth2-client-id"
CLIENT_SECRET="your-google-oauth2-client-secret"
REFRESH_TOKEN="your-google-oauth2-refresh-token"
FROM_EMAIL="your@gmail.com"

# Base URL of the frontend — used to build links inside emails
FRONTEND_URL="http://localhost:3000"
```

> **DB environment rule:**
> During development, DATABASE_URL points to local PostgreSQL 17.
> When deploying, swap DATABASE_URL to the Neon connection string — nothing else changes.
> Run `npx prisma migrate deploy` against Neon once to apply all local migrations to production.

---

## 5. Prisma Schema (Full)

> **Uniqueness note:** Most "unique" fields below are NOT enforced via `@unique`/`@@unique` in the
> Prisma schema. They are enforced via **partial unique indexes** created in a raw-SQL migration
> (`20260522180000_partial_unique_indexes_for_soft_delete`) — `CREATE UNIQUE INDEX ... WHERE
"deletedAt" IS NULL`. This lets a soft-deleted row coexist with a fresh record of the same
> value. The Prisma schema comments call this out per field.
>
> **Consequence for service code:** never rely on a Prisma unique-constraint violation to detect
> a duplicate — always pre-check with `findFirst({ where: { ..., deletedAt: null } })`. The
> P2002 fallback in `errors.ts` is a safety net, not the primary path.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  // No url field — Prisma v7 reads the connection from prisma.config.ts
}

model Firm {
  id            String    @id @default(uuid())
  // firmName / firmCode uniqueness enforced via partial unique indexes (WHERE deletedAt IS NULL)
  firmName      String
  firmCode      String
  challanEnable Boolean   @default(false)
  srNoSeries    String?
  address       String?
  contactPerson String?
  contactNumber String?
  status        String    @default("active")   // "active" | "inactive"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  machines        Machine[]
  beams           Beam[]
  productionInfos ProductionInfo[]
  takas           Taka[]
  millOutverts    MillOutvert[]
  millInverts     MillInvert[]

  @@index([status])
  @@index([deletedAt])
  @@map("firms")
}

model Mill {
  id            String    @id @default(uuid())
  // millName / millCode uniqueness enforced via partial unique indexes
  millName      String
  millCode      String?
  address       String?
  contactPerson String?
  contactNumber String?
  status        String    @default("active")     // "active" | "inactive"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  millOutverts  MillOutvert[]
  millInverts   MillInvert[]

  @@index([status])
  @@index([deletedAt])
  @@map("mills")
}

model Machine {
  id          String    @id @default(uuid())
  firmId      String
  machineNo   String
  machineType String?
  status      String    @default("active")       // "active" | "inactive"
  remark      String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  firm             Firm             @relation(fields: [firmId], references: [id])
  productionInfos  ProductionInfo[]

  // (firmId, machineNo) uniqueness enforced via partial unique index
  @@index([firmId])                      // firm-scope filter
  @@index([firmId, status])              // list active machines per firm
  @@index([firmId, deletedAt])
  @@map("machines")
}

model BeamQuality {
  id          String    @id @default(uuid())
  // name uniqueness enforced via partial unique index (global among non-deleted rows)
  name        String
  status      String    @default("active")             // "active" | "inactive"
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  beams       Beam[]

  @@index([status])
  @@index([deletedAt])
  @@map("beam_qualities")
}

model Beam {
  id            String    @id @default(uuid())
  firmId        String?                              // Nullable — auto-filled from first production entry, not at creation
  beamNo        String
  tar           Int
  beamQualityId String                               // FK → BeamQuality.id
  takaQty       Int
  beamMeter     Decimal   @db.Decimal(10, 2)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  firm            Firm?            @relation(fields: [firmId], references: [id])
  beamQuality     BeamQuality      @relation(fields: [beamQualityId], references: [id])
  productionInfos ProductionInfo[]
  takas           Taka[]

  // beamNo uniqueness enforced via partial unique index (global among non-deleted rows)
  @@index([beamQualityId])
  @@index([deletedAt])
  @@map("beams")
}

model ProductionQuality {
  id              String    @id @default(uuid())
  // name uniqueness enforced via partial unique index (global among non-deleted rows)
  name            String
  status          String    @default("active")           // "active" | "inactive"
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  productionInfos ProductionInfo[]

  @@index([status])
  @@index([deletedAt])
  @@map("production_qualities")
}

model ProductionInfo {
  id                      String    @id @default(uuid())
  firmId                  String
  machineId               String
  beamId                  String
  entryDate               DateTime
  takaNo                  String?                        // Unique within the beam; can repeat across beams
  takaSrNo                String
  takaMeter               Decimal   @db.Decimal(10, 2)
  productionQualityId     String                         // FK → ProductionQuality.id
  weight                  Decimal   @db.Decimal(10, 2)
  remark                  String?
  productionChallanNo     String?                        // Only set if firm.challanEnable = true — NOT unique
  millOutvertId           String?
  millInvertId            String?
  // Auto-filled from mill operations — never set directly by user
  millOutvertDate         DateTime?
  millInvertDate          DateTime?                      // Set when an invert links this production row
  millChallanNo           String?                        // From mill_inverts.millChallanNo
  millName                String?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  deletedAt               DateTime?

  firm               Firm              @relation(fields: [firmId], references: [id])
  machine            Machine           @relation(fields: [machineId], references: [id])
  beam               Beam              @relation(fields: [beamId], references: [id])
  productionQuality  ProductionQuality @relation(fields: [productionQualityId], references: [id])
  millOutvert        MillOutvert?      @relation(fields: [millOutvertId], references: [id])
  millInvert         MillInvert?       @relation(fields: [millInvertId], references: [id])
  taka               Taka?

  // (firmId, takaSrNo) and (beamId, takaNo) uniqueness enforced via partial unique indexes
  @@index([firmId])
  @@index([firmId, entryDate])
  @@index([firmId, machineId])
  @@index([firmId, beamId])
  @@index([firmId, productionQualityId])
  @@index([firmId, millOutvertId])
  @@index([firmId, millInvertId])
  @@index([firmId, deletedAt])
  @@index([beamId, takaNo])                              // beam-scoped takaNo lookup
  @@map("production_info")
}

model Taka {
  id               String    @id @default(uuid())
  firmId           String
  productionInfoId String    @unique
  takaSrNo         String
  takaMeter        Decimal   @db.Decimal(10, 2)
  beamId           String
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?

  firm           Firm           @relation(fields: [firmId], references: [id])
  productionInfo ProductionInfo @relation(fields: [productionInfoId], references: [id])
  beam           Beam           @relation(fields: [beamId], references: [id])

  // (firmId, takaSrNo) uniqueness enforced via partial unique index
  @@index([firmId])
  @@index([firmId, beamId])
  @@index([firmId, deletedAt])
  @@map("takas")
}

model MillOutvert {
  id             String    @id @default(uuid())
  firmId         String
  millId         String
  outvertDate    DateTime
  firmChallanNo  String
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  firm             Firm               @relation(fields: [firmId], references: [id])
  mill             Mill               @relation(fields: [millId], references: [id])
  outvertTakas     MillOutvertTaka[]
  millInverts      MillInvert[]
  productionInfos  ProductionInfo[]

  // (firmId, firmChallanNo) uniqueness enforced via partial unique index
  @@index([firmId])
  @@index([firmId, millId])
  @@index([firmId, outvertDate])
  @@index([firmId, deletedAt])
  @@map("mill_outverts")
}

model MillOutvertTaka {
  id            String   @id @default(uuid())
  millOutvertId String
  firmId        String
  takaSrNo      String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  millOutvert MillOutvert @relation(fields: [millOutvertId], references: [id])

  @@unique([millOutvertId, takaSrNo])
  @@index([millOutvertId])               // lookup all takas for an outvert
  @@index([takaSrNo])                    // mill summary — find outvert for a given taka
  @@index([firmId])
  @@map("mill_outvert_takas")
}

model MillInvert {
  id              String    @id @default(uuid())
  firmId          String
  millId          String
  millOutvertId   String
  invertDate      DateTime
  // millChallanNo uniqueness enforced via partial unique index (global among non-deleted rows)
  millChallanNo   String                             // Mill's own reference
  firmChallanNo   String                             // References the outvert's firmChallanNo
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  firm            Firm              @relation(fields: [firmId], references: [id])
  mill            Mill              @relation(fields: [millId], references: [id])
  millOutvert     MillOutvert       @relation(fields: [millOutvertId], references: [id])
  invertTakas     MillInvertTaka[]
  productionInfos ProductionInfo[]

  // (firmId, firmChallanNo) uniqueness enforced via partial unique index
  @@index([firmId])
  @@index([firmId, millId])
  @@index([firmId, invertDate])
  @@index([millOutvertId])
  @@index([firmId, deletedAt])
  @@map("mill_inverts")
}

model MillInvertTaka {
  id           String   @id @default(uuid())
  millInvertId String
  firmId       String
  takaSrNo     String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  millInvert MillInvert @relation(fields: [millInvertId], references: [id])

  @@unique([millInvertId, takaSrNo])
  @@index([millInvertId])               // lookup all takas for an invert
  @@index([takaSrNo])                   // mill summary — find invert for a given taka
  @@index([firmId])
  @@map("mill_invert_takas")
}

model User {
  id           String    @id @default(uuid())
  name         String
  // email uniqueness enforced via partial unique index (global among non-deleted rows)
  email        String
  passwordHash String
  role         String    @default("admin")          // "super_admin" | "admin"
  status       String    @default("pending")         // "active" | "inactive" | "pending"
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  passwordResetTokens PasswordResetToken[]
  permissions         AdminPermission[]

  @@index([status])                      // filter active/inactive users
  @@index([deletedAt])
  @@map("users")
}

model AdminPermission {
  id        String  @id @default(uuid())
  userId    String
  module    String  // "beam_qualities" | "production_qualities" | "machines" | "beams" | "production" | "takas" | "mill_outverts" | "mill_inverts" | "machine_info" | "mill_summary" | "firms" | "mills" | "dashboard"
  canView   Boolean @default(false)
  canCreate Boolean @default(false)
  canEdit   Boolean @default(false)
  canDelete Boolean @default(false)

  user User @relation(fields: [userId], references: [id])

  @@unique([userId, module])
  @@index([userId])
  @@map("admin_permissions")
}

model PasswordResetToken {
  id        String    @id @default(uuid())
  userId    String
  token     String    @unique                          // stored as a bcrypt HASH of the raw token (raw token only ever lives in the email link)
  expiresAt DateTime
  usedAt    DateTime?                                  // set when consumed — prevents reuse
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([token])
  @@index([userId])
  @@map("password_reset_tokens")
}
```

---

## 6. Naming Conventions

| Context                        | Convention       | Example                                          |
| ------------------------------ | ---------------- | ------------------------------------------------ |
| TypeScript variables/functions | camelCase        | `firmId`, `takaSrNo`, `getBeamById`              |
| TypeScript types/interfaces    | PascalCase       | `CreateBeamInput`, `ProductionInfo`              |
| Database table names           | snake_case       | `production_info`, `mill_outverts`               |
| Database column names          | snake_case       | `firm_id`, `taka_sr_no`                          |
| Prisma model fields            | camelCase        | `firmId`, `takaSrNo` (Prisma maps automatically) |
| Route files                    | camelCase        | `millOutverts.ts`                                |
| API route paths                | kebab-case       | `/mill-outverts`, `/machine-info`                |
| Environment variables          | UPPER_SNAKE_CASE | `JWT_ACCESS_SECRET`                              |

---

## 7. API Route Map

All routes are prefixed with `/api/v1`.
Protected routes require `Authorization: Bearer <access_token>` header.
Every protected route applies `authMiddleware` + `requirePermission(module, action)`.
`super_admin` bypasses all permission checks. `admin` is checked against `AdminPermission`.

### Auth (public)

```
POST   /api/v1/auth/login             # { email, password } → { accessToken, user }
POST   /api/v1/auth/refresh           # Uses httpOnly refresh cookie → { accessToken }
POST   /api/v1/auth/logout            # Clears refresh cookie
POST   /api/v1/auth/register          # { name, email, password } → role:"super_admin" if super admin email or first-time setup, else role:"admin" status:"pending"
POST   /api/v1/auth/forgot-password   # { email } → sends reset link (always returns 200 — never reveals if email exists)
POST   /api/v1/auth/reset-password    # { token, password } → resets password via one-time token
```

### Auth (super_admin only — requires Bearer token + role: "super_admin")

```
GET    /api/v1/auth/users             # Paginated list of all users (?search= &status= &page= &limit=)
POST   /api/v1/auth/users             # Create user directly — role:"admin", status:"active", skips pending flow
GET    /api/v1/auth/pending-users     # Paginated list of users with status:"pending"
POST   /api/v1/auth/approve-user/:id  # Set user status → "active", send approval email to user
POST   /api/v1/auth/reject-user/:id   # Soft delete the pending user record
DELETE /api/v1/auth/users/:id         # Soft delete an admin user (blocked for super_admin targets and self)
```

### Permissions

```
GET    /api/v1/permissions/:adminId   # Get all module permissions for an admin
                                      # Allowed for: super_admin OR the admin themselves (self-read)
PUT    /api/v1/permissions/:adminId   # Set/replace all module permissions for an admin (super_admin only)
                                      # Body: [{ module, canView, canCreate, canEdit, canDelete }, ...]
```

### Dashboard

```
GET    /api/v1/dashboard/stats             # ?firmId= — totalBeams, productionEntries, pendingTakas
                                           # with week-over-week change percent + trend
GET    /api/v1/dashboard/production-chart  # ?firmId= &type=daily|weekly|monthly
                                           # Time-series sum of takaMeter bucketed by period
```

### Health

```
GET    /api/v1/health                 # Public — { success: true, message: "OK" }
```

### OpenAPI / Swagger

```
GET    /api/v1/api-docs               # Interactive Swagger UI
GET    /api/v1/api-docs.json          # Raw OpenAPI spec (consumed by frontend codegen)
```

### Beam Qualities

```
GET    /api/v1/beam-qualities        # ?search= &status=
POST   /api/v1/beam-qualities        # Create beam quality — { name }
GET    /api/v1/beam-qualities/:id    # Get single beam quality
PUT    /api/v1/beam-qualities/:id    # Update beam quality
DELETE /api/v1/beam-qualities/:id    # Soft delete (blocked if beams are linked)
```

### Production Qualities

```
GET    /api/v1/production-qualities        # ?search= &status=
POST   /api/v1/production-qualities        # Create production quality — { name }
GET    /api/v1/production-qualities/:id    # Get single production quality
PUT    /api/v1/production-qualities/:id    # Update production quality
DELETE /api/v1/production-qualities/:id    # Soft delete (blocked if production records are linked)
```

### Firms (GET open to all auth'd users — writes are super_admin only)

```
GET    /api/v1/firms            # Any authenticated user
POST   /api/v1/firms            # super_admin only (assertSuperAdmin)
GET    /api/v1/firms/:id        # Any authenticated user
PUT    /api/v1/firms/:id        # super_admin only (includes challanEnable toggle)
DELETE /api/v1/firms/:id        # super_admin only — blocked if any active machine / beam / production exists
```

> Note: firms/mills routes do NOT use `requirePermission`. They use `authMiddleware` plus an
> in-handler `assertSuperAdmin(req)` helper for writes. GET is open to any logged-in user so
> admins can populate firm-pickers without needing an explicit `firms` permission.

### Mills (GET open to all auth'd users — writes are super_admin only)

```
GET    /api/v1/mills            # Any authenticated user
POST   /api/v1/mills            # super_admin only
GET    /api/v1/mills/:id        # Any authenticated user
PUT    /api/v1/mills/:id        # super_admin only
DELETE /api/v1/mills/:id        # super_admin only — soft delete
```

### Machines

```
GET    /api/v1/machines          # ?search= &status= &firmId=
POST   /api/v1/machines          # Create machine
GET    /api/v1/machines/:id      # Get single machine
PUT    /api/v1/machines/:id      # Update machine
DELETE /api/v1/machines/:id      # Soft delete
```

### Beams

```
GET    /api/v1/beams             # ?search= &qualityId= &meter_min= &meter_max= &firmId= &getAll=true
                                 # getAll=true bypasses pagination and returns the full filtered list
POST   /api/v1/beams             # Create beam — firmId is NOT supplied; it is auto-filled from the first ProductionInfo
GET    /api/v1/beams/:id         # Get single beam
PUT    /api/v1/beams/:id         # Update beam — rejects beamMeter shrinkage below sum of existing takas
DELETE /api/v1/beams/:id         # Soft delete (blocked if production records exist)
```

### Production Info

```
GET    /api/v1/production        # ?search= &machine= &beam= &date_from= &date_to= &qualityId= &firmId=
                                 # Response resolves millInvertDate: uses stored value; falls back to
                                 # millInvert.invertDate when the stored value is null (handles records
                                 # created before auto-fill was in place)
POST   /api/v1/production        # Create + auto-create Taka (atomic transaction)
GET    /api/v1/production/:id    # Get single entry with all linked data
                                 # Same millInvertDate fallback resolution as list route
PUT    /api/v1/production/:id    # Update + sync Taka (atomic)
DELETE /api/v1/production/:id    # Soft delete + soft delete linked Taka
```

### Takas (GET only)

```
GET    /api/v1/takas             # ?search= &beam_no= &meter_min= &meter_max= &firmId= &status=
                                 # meter_min and meter_max can be used independently or together —
                                 # both merge into a single takaMeter range condition
                                 # status: not_sent (no millOutvertId) | at_mill (outvert set, no invert)
                                 #         | returned (millInvertId set)
                                 # Invalid status value → 400 INVALID_STATUS
                                 # productionInfo.millInvertDate in response uses same fallback as
                                 # production routes: stored value ?? millInvert.invertDate ?? null
GET    /api/v1/takas/:id         # Get single Taka with linked ProductionInfo
                                 # productionInfo.millInvertDate uses same fallback resolution
```

### Mill Outverts

```
GET    /api/v1/mill-outverts           # ?search= &mill= &date_from= &date_to= &firmId=
POST   /api/v1/mill-outverts           # Create + sync ProductionInfo (atomic)
GET    /api/v1/mill-outverts/:id       # Get single outvert with Taka list
                                       # outvertTakas items include takaMeter (resolved from Taka table)
PUT    /api/v1/mill-outverts/:id       # Update + re-sync ProductionInfo
DELETE /api/v1/mill-outverts/:id       # Soft delete + clear mill fields in ProductionInfo
```

### Mill Inverts

```
GET    /api/v1/mill-inverts            # ?search= &mill= &date_from= &date_to= &firmId=
POST   /api/v1/mill-inverts            # Create + sync ProductionInfo (atomic)
GET    /api/v1/mill-inverts/:id        # Get single invert with Taka list
                                       # invertTakas items include takaMeter (resolved from Taka table)
PUT    /api/v1/mill-inverts/:id        # Update + re-sync ProductionInfo
DELETE /api/v1/mill-inverts/:id        # Soft delete + clear invert fields in ProductionInfo
```

### Auto-generated Views (GET only)

```
GET    /api/v1/machine-info            # ?search= &machine_no= &firmId=
                                       # search: case-insensitive contains across machineNo AND machineType
                                       # machine_no: dedicated filter on machineNo only (independent of search)
GET    /api/v1/mill-summary            # ?search= &mill= &status= &date_from= &date_to= &firmId=
```

---

## 8. Middleware Stack (in order, applied in app.ts)

```
0. app.set('trust proxy', 1) — required so express-rate-limit reads the real client IP behind Render's proxy
1. helmet()                  — HTTP security headers
2. cors({ origin: FRONTEND_URL, credentials: true })
3. express.json()
4. express.urlencoded({ extended: true })
5. cookie-parser             — needed to read the httpOnly refresh-token cookie
6. authRateLimiter           — 10 req / 15 min / IP, applied to:
                                 /api/v1/auth/login
                                 /api/v1/auth/register
                                 /api/v1/auth/forgot-password
7. Swagger UI + spec mount   — /api/v1/api-docs (UI), /api/v1/api-docs.json (raw spec)
8. authMiddleware            — verifies JWT, attaches req.user — applied per-route (not globally),
                               omitted on: /auth/login, /auth/refresh, /auth/logout,
                               /auth/register, /auth/forgot-password, /auth/reset-password, /health
9. requirePermission(module, action) — applied per route handler (not globally); super_admin always
                                       passes; admin checked against AdminPermission table. NOT used
                                       by firms/mills routes (they use assertSuperAdmin inline instead)
10. route handlers
11. errorHandler             — global error handler at the bottom of app.ts (handles AppError,
                               ZodError → 400, Prisma P2002 → 409, P2025 → 404, fallback → 500)
```

---

## 9. Critical Business Rules

### Rule 1 — Production Info + Taka: always atomic

When creating or updating a `ProductionInfo` record, the corresponding `Taka` record
must be created/updated in the **same Prisma transaction**.
If either write fails, both roll back.

```typescript
// Pattern to follow — always use prisma.$transaction
await prisma.$transaction(async (tx) => {
  const production = await tx.productionInfo.create({
    data: { ...productionData },
  });
  await tx.taka.create({
    data: {
      firmId: production.firmId,
      productionInfoId: production.id,
      takaSrNo: production.takaSrNo,
      takaMeter: production.takaMeter,
      beamId: production.beamId,
    },
  });
});
```

### Rule 2 — Challan Enable: enforced server-side

Before saving `ProductionInfo`, always check `firm.challanEnable`.
If `false`, strip `productionChallanNo` from the data before saving — even if the client sends it.

```typescript
// Pattern to follow in production.service.ts
const firm = await prisma.firm.findUnique({ where: { id: firmId } });
if (!firm?.challanEnable) {
  delete productionData.productionChallanNo;
}
```

### Rule 3 — Mill Outvert: sync ProductionInfo after save

After creating/updating a `MillOutvert`, find all `ProductionInfo` records whose
`takaSrNo` is in the outvert's `MillOutvertTaka` list, then update their `millOutvertDate`,
`millOutvertId`, and (if `firm.challanEnable = true`) their `millName`.
Do this inside a Prisma transaction.

### Rule 4 — Mill Invert: sync ProductionInfo after save

After creating/updating a `MillInvert`, find all matched `ProductionInfo` records
and update `millInvertId`, `millInvertDate`, `millChallanNo`, and `millName`.
Do this inside a Prisma transaction.

`millChallanNo` is globally unique among non-deleted mill_inverts. `firmChallanNo` is unique
per firm among non-deleted rows. Both are enforced via the service (pre-check) AND via partial
unique indexes.

### Rule 5 — Soft delete everywhere

Never use `prisma.model.delete()`. Always use:

```typescript
await prisma.model.update({
  where: { id },
  data: { deletedAt: new Date() },
});
```

All GET queries must include `where: { deletedAt: null }`.

### Rule 6 — Permission check on every protected route

Every route beyond the public auth endpoints must apply `requirePermission(module, action)` after `authMiddleware`.
`super_admin` bypasses all checks automatically. `admin` is checked against the `AdminPermission` table.

```typescript
// Pattern — always pair authMiddleware + requirePermission on every protected route
router.get('/',    authMiddleware, requirePermission('machines', 'view'),   async (req, res) => { ... });
router.post('/',   authMiddleware, requirePermission('machines', 'create'), async (req, res) => { ... });
router.put('/:id', authMiddleware, requirePermission('machines', 'edit'),   async (req, res) => { ... });
router.delete('/:id', authMiddleware, requirePermission('machines', 'delete'), async (req, res) => { ... });
```

### Rule 7 — Quality delete blocked if in use

Before soft-deleting a `BeamQuality`, check whether any non-deleted `Beam` references it.
Before soft-deleting a `ProductionQuality`, check whether any non-deleted `ProductionInfo` references it.
If any exist, reject with 400.

```typescript
// In beam-qualities DELETE handler
const count = await prisma.beam.count({
  where: { beamQualityId: id, deletedAt: null },
});
if (count > 0)
  throw new AppError(
    400,
    "Cannot delete — beams are linked",
    "BEAM_QUALITY_IN_USE",
  );

// In production-qualities DELETE handler
const count = await prisma.productionInfo.count({
  where: { productionQualityId: id, deletedAt: null },
});
if (count > 0)
  throw new AppError(
    400,
    "Cannot delete — production records are linked",
    "PRODUCTION_QUALITY_IN_USE",
  );
```

### Rule 7a — Firm delete blocked if in use

`DELETE /firms/:id` rejects with 400 if any non-deleted Machine, Beam, or ProductionInfo
references it. (Mill records carry no `firmId`.)

### Rule 7e — User delete: guards + cascade cleanup

`DELETE /api/v1/auth/users/:id` (super_admin only) enforces two guards **before** soft-deleting:

1. **Self-deletion blocked** — if `id === req.user.userId`, throw 400 `CANNOT_DELETE_SELF`.
   Checked first so the error is specific even when the caller tries to delete their own super_admin account.
2. **Super admin target blocked** — if the target user's `role === "super_admin"`, throw 400
   `CANNOT_DELETE_SUPER_ADMIN`.

On success, all three writes run inside a single `prisma.$transaction`:

```typescript
await prisma.$transaction(async (tx) => {
  // 1. Soft-delete the user record
  await tx.user.update({ where: { id }, data: { deletedAt: new Date() } });
  // 2. Hard-delete password reset tokens — no deletedAt column on this model
  await tx.passwordResetToken.deleteMany({ where: { userId: id } });
  // 3. Hard-delete admin permissions — no deletedAt column on this model
  await tx.adminPermission.deleteMany({ where: { userId: id } });
});
```

`PasswordResetToken` and `AdminPermission` have no `deletedAt` field and must be hard-deleted.
Deleting the tokens prevents a deleted user from consuming a still-valid password reset link.

### Rule 7b — Beam.firmId auto-fill on first production

A `Beam` is created with `firmId = null`. The first time a `ProductionInfo` is created against
that beam, the production service:

1. Rejects if `beam.firmId` is already set AND differs from the incoming `production.firmId`
   (`BEAM_FIRM_MISMATCH`, 409).
2. Inside the same transaction that creates the production + taka, sets `beam.firmId` to the
   production's `firmId` if it was null.

### Rule 7c — Total taka meter must never exceed beam meter

On both `POST /production` and `PUT /production/:id`, the service sums `taka.takaMeter` for the
target beam (excluding the row being updated) and rejects with 400 `TAKA_METER_EXCEEDS_BEAM`
if adding/updating this entry would push the total over `beam.beamMeter`. The same constraint
is also enforced on `PUT /beams/:id` when `beamMeter` would be reduced below the existing sum.

### Rule 7d — Taka identifiers

- `takaSrNo` is unique per firm (partial unique index + service pre-check).
- `takaNo` is unique per beam (`(beamId, takaNo)` partial unique index + service pre-check).
  It is nullable in the schema, but the create schema (`createProductionSchema`) requires it as a
  non-empty string for new entries.

### Rule 8 — User registration flow

### Rule 9 — Always embed related objects; never return bare FK ids

Every GET, POST, and PUT response must embed the full related object wherever a FK exists —
the frontend must never need a second API call to resolve an id.

**Standard include selects by relation type:**

```typescript
firm:             { select: { id: true, firmName: true, firmCode: true } }
mill:             { select: { id: true, millName: true, millCode: true } }
machine:          { select: { id: true, machineNo: true, machineType: true } }
beam:             { select: { id: true, beamNo: true, beamMeter: true,
                    beamQuality: { select: { id: true, name: true } } } }
beamQuality:      { select: { id: true, name: true } }
productionQuality:{ select: { id: true, name: true } }
taka:             { select: { id: true, takaSrNo: true, takaMeter: true } }
millOutvert:      { select: { id: true, firmChallanNo: true, outvertDate: true } }
millInvert:       { select: { id: true, millChallanNo: true, invertDate: true } }
```

**Service pattern** — define a top-level include const, derive the return type from it,
then `findUniqueOrThrow` at the end of every transaction:

```typescript
const productionInclude = {
  firm: { select: { id: true, firmName: true, firmCode: true } },
  machine: { select: { id: true, machineNo: true, machineType: true } },
  beam: {
    select: {
      id: true,
      beamNo: true,
      beamMeter: true,
      beamQuality: { select: { id: true, name: true } },
    },
  },
  taka: { select: { id: true, takaSrNo: true, takaMeter: true } },
  productionQuality: { select: { id: true, name: true } },
} as const;

type ProductionWithRelations = Prisma.ProductionInfoGetPayload<{
  include: typeof productionInclude;
}>;

// At the end of every transaction — never return the plain model:
return tx.productionInfo.findUniqueOrThrow({
  where: { id: production.id },
  include: productionInclude,
});
```

**machineInfo view** — the data map returns `machine` (with nested `firm`) and `beam` as objects,
not flat fields like `machineNo`, `firmId`, `beamNo`, `beamId`.

New users who self-register via `POST /auth/register` are created with `role: "admin"`, `status: "pending"` and
cannot log in until a super_admin approves them. Two exceptions auto-approve immediately:

1. **First-time setup** — if no user with a `SUPER_ADMIN_EMAILS` email exists in the DB yet,
   the first registrant is auto-approved as `role: "super_admin"` regardless of their email.
2. **Super admin email** — if the registrant's email is in `SUPER_ADMIN_EMAILS` env var,
   they are auto-approved with `role: "super_admin"`.

Super-admin-created users (`POST /auth/users`) are always `status: "active"` — they skip the pending flow entirely.
When a super_admin approves a pending user, that user gets `role: "admin"` with no permissions by default.
Permissions must then be explicitly granted via `PUT /api/v1/permissions/:adminId`.

---

## 10. Search & Filter Pattern

Every list route accepts a `?search=` query param that runs an `ILIKE` search
across all relevant text columns using Prisma's `OR` filter.

```typescript
// Standard search pattern — adapt columns per module
// firmId is an optional query param filter — NOT taken from req.user
const where = {
  deletedAt: null,
  ...(firmId && { firmId }), // optional: ?firmId= to filter by firm
  ...(search && {
    OR: [
      { beamNo: { contains: search, mode: "insensitive" as const } },
      {
        beamQuality: {
          name: { contains: search, mode: "insensitive" as const },
        },
      },
    ],
  }),
  // Additional filters from query params:
  ...(qualityId && { beamQualityId: qualityId }), // filter by quality FK
  ...(meterMin && { beamMeter: { gte: new Prisma.Decimal(meterMin) } }),
  ...(meterMax && { beamMeter: { lte: new Prisma.Decimal(meterMax) } }),
};
```

**Pagination:** All list routes support `?page=1&limit=20` (default limit: 20, max: 100).
Return the response in this shape:

```typescript
{
  data: T[],
  pagination: {
    total: number,
    page: number,
    limit: number,
    totalPages: number,
  }
}
```

---

## 11. Error Handling

Use the `AppError` class for all known errors. Let the global error handler in `errors.ts` catch everything.

```typescript
// src/lib/errors.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string, // e.g. 'BEAM_IN_USE', 'FIRM_NOT_FOUND'
  ) {
    super(message);
  }
}

// Usage in routes/services:
throw new AppError(404, "Beam not found", "BEAM_NOT_FOUND");
throw new AppError(
  409,
  "Beam number already exists in this firm",
  "BEAM_DUPLICATE",
);
throw new AppError(
  400,
  "Cannot delete beam — production records are linked",
  "BEAM_IN_USE",
);
```

Standard HTTP codes to use:

- `200` — success (GET, PUT)
- `201` — created (POST)
- `204` — deleted (DELETE, no body)
- `400` — bad request / validation error
- `401` — unauthenticated
- `403` — forbidden (wrong firm, wrong role)
- `404` — not found
- `409` — conflict (duplicate unique field)

---

## 12. Auth Implementation Notes

**Access token:** JWT signed with `JWT_ACCESS_SECRET`, expires in `15m`.
Payload: `{ userId, role, email }`.

**Refresh token:** JWT signed with `JWT_REFRESH_SECRET`, expires in `7d`.
Stored in httpOnly cookie: `{ httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 }`.
`secure` is gated on `NODE_ENV` so local HTTP development still works; production must run over HTTPS.

**Roles:**

- `super_admin` — full access to everything; bypasses all permission checks; identified by `SUPER_ADMIN_EMAILS` env var at registration
- `admin` — access limited to modules/actions explicitly granted via `AdminPermission`; no permissions by default after approval

**Password hashing:** Always use `bcryptjs.hash(password, 12)`.
Never return `passwordHash` in any API response — always explicitly exclude it in Prisma selects.

**Password reset tokens:** Stored in `password_reset_tokens` table. The raw token is a
32-byte random hex string (`crypto.randomBytes(32).toString('hex')`), but only its **bcrypt hash**
is persisted in `token` — the raw string only lives in the email link. Tokens expire in 1 hour and
are marked `usedAt` when consumed. To validate, fetch all non-expired/unused tokens and
`bcrypt.compare(rawToken, candidate.token)` against each — the upfront delete of any prior
tokens for the user keeps that candidate set tiny. Updating the password and marking the token
used MUST happen in a single `prisma.$transaction`.

**Login response includes permissions:** `POST /auth/login` returns
`{ accessToken, permissions, user }`. The `permissions` array is the full `AdminPermission`
rowset for the user so the frontend can render its sidebar without a second call.

**Super admin emails:** Always read via `getSuperAdminEmails()` / `isSuperAdminEmail()` from
`src/lib/superAdmin.ts`. Never hardcode emails in route or service files.

**Email sending:** Emails are sent via the Gmail API (`googleapis` package) using OAuth2
(`CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`). `nodemailer` is no longer used for transport;
the `mailer.ts` module constructs raw RFC 2822 messages and sends them through
`google.gmail({ version: 'v1' }).users.messages.send()`. All calls must remain fire-and-forget —
never `await` them on the critical response path. Always chain
`.catch((err) => console.error(...))` so a mail failure never breaks the API response.

---

## 13. Response Shape Convention

All successful responses follow this structure:

```typescript
// Single resource
{ success: true, data: { ...resource } }

// List
{ success: true, data: [...resources], pagination: { total, page, limit, totalPages } }

// Created
{ success: true, data: { ...newResource }, message: 'Created successfully' }

// Deleted
{ success: true, message: 'Deleted successfully' }

// Error (handled by global error handler)
{ success: false, message: 'Human readable message', code: 'ERROR_CODE' }
```

**Related objects are always embedded** (see Rule 9). Every response that would otherwise
contain a raw FK id (e.g. `firmId`, `machineId`, `beamId`) instead contains the full
related object under the relation name (e.g. `firm`, `machine`, `beam`). The raw FK field
is still present on the record — but the related object is always alongside it so the
frontend never needs a second call.

---

## 14. Key Packages

```json
{
  "dependencies": {
    "express": "^5.1.x", // Latest stable — Express 5 is now the default
    "@prisma/client": "^7.7.x", // Must match prisma version exactly
    "@prisma/adapter-pg": "^7.7.x", // Prisma v7 requires driver adapter — no url in schema
    "pg": "^8.x", // PostgreSQL driver used by @prisma/adapter-pg
    "zod": "^3.25.x", // Latest v3 stable
    "jsonwebtoken": "^9.0.x", // Latest stable, unchanged
    "bcryptjs": "^3.0.x", // v3 released 2025 — was ^2.x in old file
    "googleapis": "^172.0.x", // Gmail API — OAuth2 email sending (replaces nodemailer SMTP)
    "nodemailer": "^8.0.x", // Still a dependency but no longer used for SMTP transport
    "dotenv": "^16.5.x", // Latest stable
    "helmet": "^8.0.x", // v8 released 2024 — was ^7.x in old file
    "cors": "^2.8.x", // Latest stable, unchanged
    "express-rate-limit": "^7.5.x", // Latest stable
    "swagger-jsdoc": "^6.2.x", // generates OpenAPI spec from JSDoc comments
    "swagger-ui-express": "^5.0.x", // serves the Swagger UI and spec JSON endpoint
    "cookie-parser": "^1.4.x" // needed to read httpOnly refresh token cookie
  },
  "devDependencies": {
    "prisma": "^7.7.x", // CLI only — must match @prisma/client version
    "typescript": "^5.8.x", // Latest stable
    "ts-node-dev": "^2.0.x", // Latest stable, unchanged
    "eslint": "^9.x", // Linter
    "typescript-eslint": "^8.x", // TypeScript rules for ESLint
    "@eslint/js": "^9.x", // ESLint recommended ruleset
    "@types/express": "^5.0.x", // Match Express 5
    "@types/jsonwebtoken": "^9.0.x",
    "@types/bcryptjs": "^2.4.x",
    "@types/cors": "^2.8.x",
    "@types/cookie-parser": "^1.4.x",
    "@types/nodemailer": "^6.4.x", // Types for nodemailer (retained for compatibility)
    "@types/pg": "^8.x",
    "@types/swagger-jsdoc": "^6.0.x",
    "@types/swagger-ui-express": "^4.1.x",
    "@types/node": "^22.x"
  }
}
```

---

## 15. What NOT to Do

- Do NOT use `any` type anywhere in TypeScript
- Do NOT use `prisma.model.delete()` — always soft delete
- Do NOT use `req.user.firmId` for DB query scoping — users have no firmId; `firmId` is only an optional query-param filter
- Do NOT write mill sync logic inside route handlers — put it in service files
- Do NOT create/update `ProductionInfo` and `Taka` in separate DB calls — always use `prisma.$transaction`
- Do NOT return `passwordHash` in any response — exclude it explicitly
- Do NOT skip `deletedAt: null` in any findMany/findFirst query
- Do NOT use `console.log` for errors — use `console.error` in dev; replace with a logger in prod
- Do NOT mutate `req.body` directly — destructure it first into typed variables
- Do NOT hardcode super admin emails anywhere — always use `getSuperAdminEmails()` from `src/lib/superAdmin.ts`
- Do NOT `await` email sends on the critical response path — fire-and-forget with `.catch((err) => console.error(...))`
- Do NOT skip `requirePermission` on any protected route — every non-public route must declare its
  module and action. The ONLY documented exceptions are firms/mills (which use `assertSuperAdmin`
  inline because GET is open to all authenticated users) and the auth super_admin endpoints
  (which also use `assertSuperAdmin`). Don't invent new exceptions.
- Do NOT perform permission checks inside route handlers when `requirePermission` would suffice
- Do NOT rely on a Prisma unique-constraint error (P2002) to detect duplicates on fields like
  `firmName`, `firmCode`, `beamNo`, `takaSrNo`, `takaNo`, `firmChallanNo`, `millChallanNo`, `email`,
  etc. Those constraints are partial unique indexes scoped to `deletedAt IS NULL` — always pre-check
  with `findFirst({ where: { ..., deletedAt: null } })` and throw a 409 `AppError` with a specific code
- Do NOT return bare FK ids without the related object — every GET/POST/PUT response must embed the full related object (see Rule 9); use `include` on every `create`, `update`, and `findMany`/`findFirst`/`findUniqueOrThrow` call
- Do NOT return the plain Prisma model from service functions — services must always `findUniqueOrThrow` at the end of each transaction with the module's `*Include` const so the enriched type is returned
- Do NOT use `beamQuality: true` (full include with all fields) when embedding quality objects — always use `{ select: { id: true, name: true } }` to avoid leaking `deletedAt` and audit timestamps

---

## 16. OpenAPI Spec + Frontend Type Generation

### What this enables

The backend exposes its OpenAPI spec as JSON at a dedicated endpoint.
The frontend runs one command to pull that spec and auto-generate TypeScript types —
no manual typing of request/response shapes needed on the frontend ever.

### Backend setup (add to app.ts)

```typescript
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Textile API", version: "1.0.0" },
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/*.ts"], // reads JSDoc comments from all route files
});

// Serves the interactive Swagger UI (useful during development)
app.use("/api/v1/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Serves the raw OpenAPI JSON — this is what the frontend codegen tool fetches
app.get("/api/v1/api-docs.json", (req, res) => res.json(swaggerSpec));
```

### JSDoc comment pattern on every route

```typescript
/**
 * @openapi
 * /api/v1/beams:
 *   get:
 *     summary: List beams
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: firmId
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of beams with pagination
 */
router.get(
  "/",
  authMiddleware,
  requirePermission("beams", "view"),
  async (req, res) => {
    // ... handler
  },
);
```

### Frontend command — run once after any backend route changes

```bash
# In the frontend project root:
npx openapi-typescript http://localhost:4000/api/v1/api-docs.json -o src/types/api.d.ts
```

Add this as a script in the frontend package.json:

```json
"scripts": {
  "generate:types": "openapi-typescript http://localhost:4000/api/v1/api-docs.json -o src/types/api.d.ts"
}
```

Run: `npm run generate:types` — done. All route types are available in the frontend.

---

## 17. Prisma v7 — Connection Configuration

Prisma v7 removed `url = env("DATABASE_URL")` from the `datasource` block.
Connection config now lives in **two places**:

| Where                                              | Purpose                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------- |
| `prisma.config.ts` (root)                          | Prisma CLI — used by `prisma migrate`, `prisma generate`, `prisma studio` |
| `PrismaClient({ adapter })` in `src/lib/prisma.ts` | Runtime queries                                                           |

```typescript
// prisma.config.ts — CLI reads this for migrations
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"), // use env() helper, not process.env — file is outside tsconfig rootDir
  },
});
```

```typescript
// src/lib/prisma.ts — runtime client
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter, log: ["error"] });
}
```

`DATABASE_URL` is still loaded from `.env` via dotenv — nothing changes for the env var itself.

---

## 18. ESLint Setup

Config file: `eslint.config.mjs` (flat config, always ESM via `.mjs` extension).

```javascript
// eslint.config.mjs
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error", // enforces Section 15 rule
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["error", { allow: ["error"] }], // only console.error allowed
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
```

**Scripts:**

```bash
npm run lint        # check for errors
npm run lint:fix    # auto-fix where possible
```

**Rule rationale:**

| Rule                                        | Why                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `@typescript-eslint/no-explicit-any: error` | Enforces the "no `any`" requirement from Section 15                  |
| `@typescript-eslint/no-unused-vars: error`  | Catches dead variables; prefix with `_` to intentionally ignore      |
| `no-console` (allow `error`)                | Section 15 — `console.log` forbidden, `console.error` allowed in dev |

---

## 19. Testing

### Stack

| Tool      | Role                                                             |
| --------- | ---------------------------------------------------------------- |
| Jest v30  | Test runner                                                      |
| ts-jest   | Compiles TypeScript tests — uses `tsconfig.test.json`            |
| Supertest | HTTP integration testing — mounts `app` directly, no live server |

### Config files

- `jest.config.ts` — preset: `ts-jest`, testMatch: `src/tests/**/*.test.ts`, setupFiles: `src/tests/setup.ts`
- `tsconfig.test.json` — extends `tsconfig.json`, overrides `module: CommonJS` + `moduleResolution: node10` (Jest requires CJS; `ignoreDeprecations: "6.0"` silences the TS deprecation warning)
- `src/tests/tsconfig.json` — thin file that extends `tsconfig.test.json` and adds `types: ["jest", "node"]`

### Test environment setup (`src/tests/setup.ts`)

Seeds all required `process.env` values before any test file runs — no `.env` file is read during tests.
`DATABASE_URL` is set to a dummy value because Prisma is always mocked; no real DB connection is made.

### Mocking strategy

All tests use **unit-style mocking** — no real database or network calls.

```typescript
// Mock prisma at the top of every test file (hoisted by Jest)
// Include every model whose methods the route-under-test calls.
jest.mock("../lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    passwordResetToken: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    adminPermission: { findMany: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

// Mock mailer — fire-and-forget emails must not run in tests
jest.mock("../lib/mailer", () => ({
  sendApprovalRequestEmail: jest.fn(),
  sendAccountApprovedEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));
```

**`beforeEach` reset pattern** — `jest.clearAllMocks()` clears call history but does **not** reset
`mockReturnValue` / `mockResolvedValue` implementations. Always re-declare any mock return value that
a test overrides, and reset commonly-shared mocks (like `isSuperAdminEmail`, `bcryptjs.compare`) back
to safe defaults in `beforeEach` to prevent state from leaking across tests:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({
    userId: SUPER_ADMIN_ID,
    role: "super_admin",
    email: "...",
  });
  mockIsSuperAdmin.mockReturnValue(false); // prevent leak from tests that set it to true
  mockBcrypt.compare.mockResolvedValue(true); // prevent leak from "wrong password" tests
  db.$transaction.mockImplementation(async (cb) => cb(db));
});
```

### Running tests

```bash
npm test              # run all tests
npm test -- --watch   # watch mode
npm test -- auth      # run a single file by name fragment
```

### Test coverage — one file per route module

| Test file                     | Route covered                  |
| ----------------------------- | ------------------------------ |
| `auth.test.ts`                | `/api/v1/auth/*`               |
| `firms.test.ts`               | `/api/v1/firms`                |
| `mills.test.ts`               | `/api/v1/mills`                |
| `beamQualities.test.ts`       | `/api/v1/beam-qualities`       |
| `productionQualities.test.ts` | `/api/v1/production-qualities` |
| `machines.test.ts`            | `/api/v1/machines`             |
| `beams.test.ts`               | `/api/v1/beams`                |
| `production.test.ts`          | `/api/v1/production`           |
| `takas.test.ts`               | `/api/v1/takas`                |
| `millOutverts.test.ts`        | `/api/v1/mill-outverts`        |
| `millInverts.test.ts`         | `/api/v1/mill-inverts`         |
| `machineInfo.test.ts`         | `/api/v1/machine-info`         |
| `millSummary.test.ts`         | `/api/v1/mill-summary`         |
| `permissions.test.ts`         | `/api/v1/permissions`          |
