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
│   ├── index.ts               # App entry point — starts Express server
│   ├── app.ts                 # Express app setup — middleware, routes mounted here
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification — attaches req.user to every protected request
│   │   └── permission.ts      # requirePermission(module, action) — super_admin bypasses; admin checks AdminPermission
│   ├── routes/
│   │   ├── auth.ts            # POST /api/v1/auth/login, /refresh, /logout, /register,
│   │   │                      # /forgot-password, /reset-password, /users (super_admin),
│   │   │                      # GET /pending-users (super_admin),
│   │   │                      # POST /approve-user/:id, /reject-user/:id (super_admin)
│   │   ├── firms.ts           # CRUD for firms (super_admin only)
│   │   ├── mills.ts           # CRUD for mills (super_admin only)
│   │   ├── beamQualities.ts   # CRUD for beam_qualities — /api/v1/beam-qualities
│   │   ├── productionQualities.ts # CRUD for production_qualities — /api/v1/production-qualities
│   │   ├── machines.ts        # CRUD for machines — /api/v1/machines
│   │   ├── beams.ts           # CRUD for beams — /api/v1/beams
│   │   ├── production.ts      # CRUD for production_info — /api/v1/production
│   │   ├── takas.ts           # GET only (view) — /api/v1/takas
│   │   ├── millOutverts.ts    # CRUD for mill_outverts — /api/v1/mill-outverts
│   │   ├── millInverts.ts     # CRUD for mill_inverts — /api/v1/mill-inverts
│   │   ├── machineInfo.ts     # GET only (view) — /api/v1/machine-info
│   │   ├── millSummary.ts     # GET only (view) — /api/v1/mill-summary
│   │   └── permissions.ts     # GET/PUT /api/v1/permissions/:adminId (super_admin only)
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
│   │   └── permission.schema.ts
│   ├── services/
│   │   ├── production.service.ts   # Business logic for production + taka atomic writes
│   │   │                           # Defines productionInclude const + ProductionWithRelations type
│   │   │                           # createProductionEntry / updateProductionEntry return enriched object
│   │   ├── millOutvert.service.ts  # Business logic for outvert + production sync
│   │   │                           # Defines millOutvertInclude const + MillOutvertWithRelations type
│   │   └── millInvert.service.ts   # Business logic for invert + production sync
│   │                               # Defines millInvertInclude const + MillInvertWithRelations type
│   ├── lib/
│   │   ├── prisma.ts          # Prisma client singleton — import this everywhere
│   │   ├── jwt.ts             # signToken, verifyToken helpers
│   │   ├── errors.ts          # AppError class + error handler middleware
│   │   ├── mailer.ts          # nodemailer — sendApprovalRequestEmail, sendPasswordResetEmail, sendAccountApprovedEmail
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
│   └── migrations/
├── prisma.config.ts           # Prisma v7 datasource config — DATABASE_URL lives here
├── jest.config.ts             # Jest config — ts-jest preset, points to tsconfig.test.json
├── eslint.config.mjs          # ESLint flat config — TypeScript rules
├── .env
├── .env.example
├── tsconfig.json              # Production/dev TypeScript config — module: NodeNext
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

# SMTP — used for approval request emails, password reset emails, and account approved emails
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your@gmail.com"
SMTP_PASS="your-app-password"

# Base URL of the frontend — used to build links inside emails
FRONTEND_URL="http://localhost:3000"
```

> **DB environment rule:**
> During development, DATABASE_URL points to local PostgreSQL 17.
> When deploying, swap DATABASE_URL to the Neon connection string — nothing else changes.
> Run `npx prisma migrate deploy` against Neon once to apply all local migrations to production.

---

## 5. Prisma Schema (Full)

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
  id              String    @id @default(uuid())
  firmName        String    @unique
  firmCode        String    @unique
  challanEnable   Boolean   @default(false)
  srNoSeries      String?
  address         String?
  contactPerson   String?
  contactNumber   String?
  status          String    @default("active")   // "active" | "inactive"
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  machines        Machine[]
  beams           Beam[]
  productionInfos ProductionInfo[]
  takas           Taka[]
  millOutverts    MillOutvert[]
  millInverts     MillInvert[]

  @@index([status])                      // filter active/inactive firms
  @@index([deletedAt])                   // soft-delete filter
  @@map("firms")
}

model Mill {
  id            String    @id @default(uuid())
  millName      String    @unique
  millCode      String?   @unique
  address       String?
  contactPerson String?
  contactNumber String?
  status        String    @default("active")     // "active" | "inactive"
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  millOutverts  MillOutvert[]
  millInverts   MillInvert[]

  @@index([status])                      // filter active/inactive mills
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

  @@unique([firmId, machineNo])
  @@index([firmId])                      // firm-scope filter
  @@index([firmId, status])              // list active machines per firm
  @@index([firmId, deletedAt])
  @@map("machines")
}

model BeamQuality {
  id          String    @id @default(uuid())
  name        String    @unique                        // e.g. "60s", "40s/2" — unique globally
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
  id              String    @id @default(uuid())
  firmId          String
  beamNo          String
  tar             Int
  beamQualityId   String                               // FK → BeamQuality.id
  takaQty         Int
  beamMeter       Decimal   @db.Decimal(10, 2)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  firm            Firm             @relation(fields: [firmId], references: [id])
  beamQuality     BeamQuality      @relation(fields: [beamQualityId], references: [id])
  productionInfos ProductionInfo[]
  takas           Taka[]

  @@unique([firmId, beamNo])
  @@index([firmId])                      // firm-scope filter on every list query
  @@index([firmId, beamQualityId])       // filter by quality within a firm
  @@index([firmId, deletedAt])           // soft-delete filter performance
  @@map("beams")
}

model ProductionQuality {
  id              String    @id @default(uuid())
  name            String    @unique                      // e.g. "Plain", "Twill" — unique globally
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
  takaSrNo                String
  takaMeter               Decimal   @db.Decimal(10, 2)
  productionQualityId     String                         // FK → ProductionQuality.id
  weight                  Decimal   @db.Decimal(10, 2)
  remark                  String?
  productionChallanNo     String?                        // Only set if firm.challanEnable = true
  millOutvertId           String?
  millInvertId            String?
  // Auto-filled from mill operations — never set directly by user
  millOutvertDate         DateTime?
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

  @@unique([firmId, takaSrNo])
  @@unique([firmId, productionChallanNo])
  @@index([firmId])                                       // firm-scope on all list queries
  @@index([firmId, entryDate])                            // date range filter (most common filter)
  @@index([firmId, machineId])                            // machine-info view — latest entry per machine
  @@index([firmId, beamId])                               // filter by beam
  @@index([firmId, productionQualityId])                  // filter by quality
  @@index([firmId, millOutvertId])                        // outvert sync lookup
  @@index([firmId, millInvertId])                         // invert sync lookup
  @@index([firmId, deletedAt])                            // soft-delete filter
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

  @@unique([firmId, takaSrNo])
  @@index([firmId])                      // firm-scope filter
  @@index([firmId, beamId])              // filter takas by beam
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

  @@unique([firmId, firmChallanNo])
  @@index([firmId])                      // firm-scope filter
  @@index([firmId, millId])              // filter by mill
  @@index([firmId, outvertDate])         // date range filter
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
  millChallanNo   String    @unique                  // Mill's own reference — unique globally
  firmChallanNo   String                             // References the outvert's firmChallanNo
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  deletedAt       DateTime?

  firm            Firm              @relation(fields: [firmId], references: [id])
  mill            Mill              @relation(fields: [millId], references: [id])
  millOutvert     MillOutvert       @relation(fields: [millOutvertId], references: [id])
  invertTakas     MillInvertTaka[]
  productionInfos ProductionInfo[]

  @@unique([firmId, firmChallanNo])
  @@index([firmId])                      // firm-scope filter
  @@index([firmId, millId])              // filter by mill
  @@index([firmId, invertDate])          // date range filter
  @@index([millOutvertId])               // match invert back to its outvert
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
  email        String    @unique
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
  module    String  // "beam_qualities" | "production_qualities" | "machines" | "beams" | "production" | "takas" | "mill_outverts" | "mill_inverts" | "machine_info" | "mill_summary" | "firms" | "mills"
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
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?                      // set when consumed — prevents reuse
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
POST   /api/v1/auth/users             # Create user directly — always status:"active", skips pending flow
GET    /api/v1/auth/pending-users     # List all users with status:"pending"
POST   /api/v1/auth/approve-user/:id  # Set user status → "active", send approval email to user
POST   /api/v1/auth/reject-user/:id   # Soft delete the pending user record
```

### Permissions (super_admin only)

```
GET    /api/v1/permissions/:adminId   # Get all module permissions for an admin
PUT    /api/v1/permissions/:adminId   # Set/replace all module permissions for an admin
                                      # Body: [{ module, canView, canCreate, canEdit, canDelete }, ...]
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

### Firms (super_admin only)

```
GET    /api/v1/firms            # List all firms
POST   /api/v1/firms            # Create firm
GET    /api/v1/firms/:id        # Get single firm
PUT    /api/v1/firms/:id        # Update firm (including challanEnable toggle)
DELETE /api/v1/firms/:id        # Soft delete (set deletedAt)
```

### Mills (super_admin only)

```
GET    /api/v1/mills            # List all mills
POST   /api/v1/mills            # Create mill
GET    /api/v1/mills/:id        # Get single mill
PUT    /api/v1/mills/:id        # Update mill
DELETE /api/v1/mills/:id        # Soft delete
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
GET    /api/v1/beams             # ?search= &qualityId= &meter_min= &meter_max= &firmId=
POST   /api/v1/beams             # Create beam
GET    /api/v1/beams/:id         # Get single beam
PUT    /api/v1/beams/:id         # Update beam
DELETE /api/v1/beams/:id         # Soft delete (blocked if production records exist)
```

### Production Info

```
GET    /api/v1/production        # ?search= &machine= &beam= &date_from= &date_to= &qualityId= &firmId=
POST   /api/v1/production        # Create + auto-create Taka (atomic transaction)
GET    /api/v1/production/:id    # Get single entry with all linked data
PUT    /api/v1/production/:id    # Update + sync Taka (atomic)
DELETE /api/v1/production/:id    # Soft delete + soft delete linked Taka
```

### Takas (GET only)

```
GET    /api/v1/takas             # ?search= &beam_no= &meter_min= &meter_max= &firmId=
GET    /api/v1/takas/:id         # Get single Taka with linked ProductionInfo
```

### Mill Outverts

```
GET    /api/v1/mill-outverts           # ?search= &mill= &date_from= &date_to= &firmId=
POST   /api/v1/mill-outverts           # Create + sync ProductionInfo (atomic)
GET    /api/v1/mill-outverts/:id       # Get single outvert with Taka list
PUT    /api/v1/mill-outverts/:id       # Update + re-sync ProductionInfo
DELETE /api/v1/mill-outverts/:id       # Soft delete + clear mill fields in ProductionInfo
```

### Mill Inverts

```
GET    /api/v1/mill-inverts            # ?search= &mill= &date_from= &date_to= &firmId=
POST   /api/v1/mill-inverts            # Create + sync ProductionInfo (atomic)
GET    /api/v1/mill-inverts/:id        # Get single invert with Taka list
PUT    /api/v1/mill-inverts/:id        # Update + re-sync ProductionInfo
DELETE /api/v1/mill-inverts/:id        # Soft delete + clear invert fields in ProductionInfo
```

### Auto-generated Views (GET only)

```
GET    /api/v1/machine-info            # ?search= &machine_no= &firmId=
GET    /api/v1/mill-summary            # ?search= &mill= &status= &date_from= &date_to= &firmId=
```

---

## 8. Middleware Stack (in order, applied in app.ts)

```
1. helmet()                   — HTTP security headers
2. cors({ origin: FRONTEND_URL })
3. express.json()
4. express.urlencoded()
5. rateLimiter               — applied only to /api/v1/auth/login (10 req / 15 min / IP)
6. authMiddleware            — verifies JWT, attaches req.user — applied to all routes except:
                               /auth/login, /auth/refresh, /auth/logout,
                               /auth/register, /auth/forgot-password, /auth/reset-password
7. requirePermission(module, action) — applied per route handler (not globally); super_admin always passes; admin checked against AdminPermission table
8. route handlers
9. errorHandler              — global error handler at the bottom of app.ts
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
and update `millInvertId`, `millChallanNo`, and `millName`.
Do this inside a Prisma transaction.

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
const count = await prisma.beam.count({ where: { beamQualityId: id, deletedAt: null } });
if (count > 0) throw new AppError(400, 'Cannot delete — beams are linked', 'BEAM_QUALITY_IN_USE');

// In production-qualities DELETE handler
const count = await prisma.productionInfo.count({ where: { productionQualityId: id, deletedAt: null } });
if (count > 0) throw new AppError(400, 'Cannot delete — production records are linked', 'PRODUCTION_QUALITY_IN_USE');
```

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
      id: true, beamNo: true, beamMeter: true,
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
  ...(firmId && { firmId }),             // optional: ?firmId= to filter by firm
  ...(search && {
    OR: [
      { beamNo: { contains: search, mode: "insensitive" as const } },
      { beamQuality: { name: { contains: search, mode: "insensitive" as const } } },
    ],
  }),
  // Additional filters from query params:
  ...(qualityId && { beamQualityId: qualityId }),   // filter by quality FK
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
Stored in httpOnly cookie: `{ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 }`.

**Roles:**

- `super_admin` — full access to everything; bypasses all permission checks; identified by `SUPER_ADMIN_EMAILS` env var at registration
- `admin` — access limited to modules/actions explicitly granted via `AdminPermission`; no permissions by default after approval

**Password hashing:** Always use `bcryptjs.hash(password, 12)`.
Never return `passwordHash` in any API response — always explicitly exclude it in Prisma selects.

**Password reset tokens:** Stored in `password_reset_tokens` table. Each token is a 32-byte random hex
string, expires in 1 hour, marked `usedAt` when consumed. Always check `usedAt === null` AND
`expiresAt > now` before accepting a token.

**Super admin emails:** Always read via `getSuperAdminEmails()` / `isSuperAdminEmail()` from
`src/lib/superAdmin.ts`. Never hardcode emails in route or service files.

**Email sending:** All calls to `mailer.ts` must be fire-and-forget — never `await` them on the
critical response path. Always chain `.catch((err) => console.error(...))` so a mail failure never
breaks the API response.

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
    "nodemailer": "^6.9.x", // Email sending — approval requests, password resets
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
    "@types/nodemailer": "^6.4.x", // Types for nodemailer
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
- Do NOT skip `requirePermission` on any protected route — every non-public route must declare its module and action
- Do NOT perform permission checks inside route handlers — always use the `requirePermission` middleware
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
router.get("/", authMiddleware, requirePermission('beams', 'view'), async (req, res) => {
  // ... handler
});
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

| Tool        | Role                                                              |
| ----------- | ----------------------------------------------------------------- |
| Jest v30    | Test runner                                                       |
| ts-jest     | Compiles TypeScript tests — uses `tsconfig.test.json`             |
| Supertest   | HTTP integration testing — mounts `app` directly, no live server  |

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
jest.mock("../lib/prisma", () => ({
  prisma: {
    user: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), ... },
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

### Running tests

```bash
npm test              # run all tests
npm test -- --watch   # watch mode
npm test -- auth      # run a single file by name fragment
```

### Test coverage — one file per route module

| Test file              | Route covered            |
| ---------------------- | ------------------------ |
| `auth.test.ts`         | `/api/v1/auth/*`         |
| `firms.test.ts`        | `/api/v1/firms`          |
| `mills.test.ts`        | `/api/v1/mills`          |
| `beamQualities.test.ts`       | `/api/v1/beam-qualities`       |
| `productionQualities.test.ts` | `/api/v1/production-qualities` |
| `machines.test.ts`     | `/api/v1/machines`       |
| `beams.test.ts`        | `/api/v1/beams`          |
| `production.test.ts`   | `/api/v1/production`     |
| `takas.test.ts`        | `/api/v1/takas`          |
| `millOutverts.test.ts` | `/api/v1/mill-outverts`  |
| `millInverts.test.ts`  | `/api/v1/mill-inverts`   |
| `machineInfo.test.ts`  | `/api/v1/machine-info`   |
| `millSummary.test.ts`  | `/api/v1/mill-summary`   |
| `permissions.test.ts`  | `/api/v1/permissions`    |
