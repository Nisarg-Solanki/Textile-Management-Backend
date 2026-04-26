# CLAUDE.md — Textile Production Management System (Backend)

> Read this file fully before writing any code.
> This is the single source of truth for the entire backend.

---

## 1. Project Overview

A multi-firm textile production management system. Firms manage beams, production records,
taka (fabric rolls), mill dispatch/receipt operations, and machine status tracking.

**Key rule:** Every piece of data belongs to a firm. Users can never access another firm's data.
This must be enforced at the middleware level on every route — not just in the query.

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

**Do NOT suggest switching frameworks, ORMs, or validation libraries mid-task.**
**Do NOT use `any` type in TypeScript. Always type everything explicitly.**

---

## 3. Folder Structure

```
backend/
├── src/
│   ├── index.ts               # App entry point — starts Express server
│   ├── app.ts                 # Express app setup — middleware, routes mounted here
│   ├── prisma/
│   │   └── schema.prisma      # Prisma schema — single source of DB truth
│   ├── middleware/
│   │   ├── auth.ts            # JWT verification — attaches req.user to every protected request
│   │   └── firmScope.ts       # Validates req.user.firmId matches the :firmId route param
│   ├── routes/
│   │   ├── auth.ts            # POST /api/v1/auth/login, /refresh, /logout, /register,
│   │   │                      # /forgot-password, /reset-password, /users (admin),
│   │   │                      # GET /pending-users (admin),
│   │   │                      # POST /approve-user/:id, /reject-user/:id (admin)
│   │   ├── firms.ts           # CRUD for firms (admin only)
│   │   ├── mills.ts           # CRUD for mills (admin only)
│   │   ├── machines.ts        # CRUD for machines — nested under /firms/:firmId
│   │   ├── beams.ts           # CRUD for beams — nested under /firms/:firmId
│   │   ├── production.ts      # CRUD for production_info — nested under /firms/:firmId
│   │   ├── takas.ts           # GET only (view) — nested under /firms/:firmId
│   │   ├── millOutverts.ts    # CRUD for mill_outverts — nested under /firms/:firmId
│   │   ├── millInverts.ts     # CRUD for mill_inverts — nested under /firms/:firmId
│   │   ├── machineInfo.ts     # GET only (view) — nested under /firms/:firmId
│   │   └── millSummary.ts     # GET only (view) — nested under /firms/:firmId
│   ├── schemas/
│   │   ├── auth.schema.ts
│   │   ├── firm.schema.ts
│   │   ├── mill.schema.ts
│   │   ├── machine.schema.ts
│   │   ├── beam.schema.ts
│   │   ├── production.schema.ts
│   │   ├── millOutvert.schema.ts
│   │   └── millInvert.schema.ts
│   ├── services/
│   │   ├── production.service.ts   # Business logic for production + taka atomic writes
│   │   ├── millOutvert.service.ts  # Business logic for outvert + production sync
│   │   └── millInvert.service.ts   # Business logic for invert + production sync
│   └── lib/
│       ├── prisma.ts          # Prisma client singleton — import this everywhere
│       ├── jwt.ts             # signToken, verifyToken helpers
│       ├── errors.ts          # AppError class + error handler middleware
│       ├── mailer.ts          # nodemailer — sendApprovalRequestEmail, sendPasswordResetEmail, sendAccountApprovedEmail
│       └── superAdmin.ts      # getSuperAdminEmails(), isSuperAdminEmail() — reads SUPER_ADMIN_EMAILS env var
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── prisma.config.ts           # Prisma v7 datasource config — DATABASE_URL lives here
├── eslint.config.mjs          # ESLint flat config — TypeScript rules
├── .env
├── .env.example
├── tsconfig.json
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
CLIENT_URL="http://localhost:3000"
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
  users           User[]

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

model Beam {
  id          String    @id @default(uuid())
  firmId      String
  beamNo      String
  tar         Int
  beamQuality String
  takaQty     Int
  beamMeter   Decimal   @db.Decimal(10, 2)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  firm            Firm             @relation(fields: [firmId], references: [id])
  productionInfos ProductionInfo[]
  takas           Taka[]

  @@unique([firmId, beamNo])
  @@index([firmId])                      // firm-scope filter on every list query
  @@index([firmId, beamQuality])         // filter by quality within a firm
  @@index([firmId, deletedAt])           // soft-delete filter performance
  @@map("beams")
}

model ProductionInfo {
  id                   String    @id @default(uuid())
  firmId               String
  machineId            String
  beamId               String
  entryDate            DateTime
  takaSrNo             String
  takaMeter            Decimal   @db.Decimal(10, 2)
  productionQuality    String
  weight               Decimal   @db.Decimal(10, 2)
  remark               String?
  productionChallanNo  String?                        // Only set if firm.challanEnable = true
  millOutvertId        String?
  millInvertId         String?
  // Auto-filled from mill operations — never set directly by user
  millOutvertDate      DateTime?
  millChallanNo        String?                        // From mill_inverts.millChallanNo
  millName             String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  deletedAt            DateTime?

  firm        Firm         @relation(fields: [firmId], references: [id])
  machine     Machine      @relation(fields: [machineId], references: [id])
  beam        Beam         @relation(fields: [beamId], references: [id])
  millOutvert MillOutvert? @relation(fields: [millOutvertId], references: [id])
  millInvert  MillInvert?  @relation(fields: [millInvertId], references: [id])
  taka        Taka?

  @@unique([firmId, takaSrNo])
  @@unique([firmId, productionChallanNo])
  @@index([firmId])                                    // firm-scope on all list queries
  @@index([firmId, entryDate])                         // date range filter (most common filter)
  @@index([firmId, machineId])                         // machine-info view — latest entry per machine
  @@index([firmId, beamId])                            // filter by beam
  @@index([firmId, productionQuality])                 // filter by quality
  @@index([firmId, millOutvertId])                     // outvert sync lookup
  @@index([firmId, millInvertId])                      // invert sync lookup
  @@index([firmId, deletedAt])                         // soft-delete filter
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
  firmId       String?                              // null = admin (access to all firms)
  name         String
  email        String    @unique
  passwordHash String
  role         String    @default("operator")       // "admin" | "firm_manager" | "operator"
  status       String    @default("pending")        // "active" | "inactive" | "pending"  ← changed from "active"; self-registered users wait for admin approval
  lastLoginAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  firm                Firm?                @relation(fields: [firmId], references: [id])
  passwordResetTokens PasswordResetToken[]           // ← new relation

  @@index([firmId])                      // list users by firm
  @@index([status])                      // filter active/inactive users
  @@index([deletedAt])
  @@map("users")
}

// New model — one-time tokens for password reset flow
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
Firm-scoped routes also run `firmScopeMiddleware` which verifies `req.user.firmId === req.params.firmId`
(admin users bypass the firm scope check).

### Auth (public)

```
POST   /api/v1/auth/login             # { email, password } → { accessToken, user }
POST   /api/v1/auth/refresh           # Uses httpOnly refresh cookie → { accessToken }
POST   /api/v1/auth/logout            # Clears refresh cookie
POST   /api/v1/auth/register          # { name, email, password, firmId? } → status:"active" if super admin email or first-time setup, else status:"pending"
POST   /api/v1/auth/forgot-password   # { email } → sends reset link (always returns 200 — never reveals if email exists)
POST   /api/v1/auth/reset-password    # { token, password } → resets password via one-time token
```

### Auth (admin only — requires Bearer token + role: "admin")

```
POST   /api/v1/auth/users             # Create user directly — always status:"active", skips pending flow
GET    /api/v1/auth/pending-users     # List all users with status:"pending"
POST   /api/v1/auth/approve-user/:id  # Set user status → "active", send approval email to user
POST   /api/v1/auth/reject-user/:id   # Soft delete the pending user record
```

### Firms (admin only)

```
GET    /api/v1/firms            # List all firms
POST   /api/v1/firms            # Create firm
GET    /api/v1/firms/:id        # Get single firm
PUT    /api/v1/firms/:id        # Update firm (including challanEnable toggle)
DELETE /api/v1/firms/:id        # Soft delete (set deletedAt)
```

### Mills (admin only)

```
GET    /api/v1/mills            # List all mills
POST   /api/v1/mills            # Create mill
GET    /api/v1/mills/:id        # Get single mill
PUT    /api/v1/mills/:id        # Update mill
DELETE /api/v1/mills/:id        # Soft delete
```

### Machines (firm-scoped)

```
GET    /api/v1/firms/:firmId/machines        # List machines for firm. ?search= &status=
POST   /api/v1/firms/:firmId/machines        # Create machine
GET    /api/v1/firms/:firmId/machines/:id    # Get single machine
PUT    /api/v1/firms/:firmId/machines/:id    # Update machine
DELETE /api/v1/firms/:firmId/machines/:id    # Soft delete
```

### Beams (firm-scoped)

```
GET    /api/v1/firms/:firmId/beams           # ?search= &quality= &meter_min= &meter_max=
POST   /api/v1/firms/:firmId/beams           # Create beam
GET    /api/v1/firms/:firmId/beams/:id       # Get single beam
PUT    /api/v1/firms/:firmId/beams/:id       # Update beam
DELETE /api/v1/firms/:firmId/beams/:id       # Soft delete (blocked if production records exist)
```

### Production Info (firm-scoped)

```
GET    /api/v1/firms/:firmId/production      # ?search= &machine= &beam= &date_from= &date_to= &quality=
POST   /api/v1/firms/:firmId/production      # Create + auto-create Taka (atomic transaction)
GET    /api/v1/firms/:firmId/production/:id  # Get single entry with all linked data
PUT    /api/v1/firms/:firmId/production/:id  # Update + sync Taka (atomic)
DELETE /api/v1/firms/:firmId/production/:id  # Soft delete + soft delete linked Taka
```

### Takas (firm-scoped, GET only)

```
GET    /api/v1/firms/:firmId/takas           # ?search= &beam_no= &meter_min= &meter_max=
GET    /api/v1/firms/:firmId/takas/:id       # Get single Taka with linked ProductionInfo
```

### Mill Outverts (firm-scoped)

```
GET    /api/v1/firms/:firmId/mill-outverts           # ?search= &mill= &date_from= &date_to=
POST   /api/v1/firms/:firmId/mill-outverts           # Create + sync ProductionInfo (atomic)
GET    /api/v1/firms/:firmId/mill-outverts/:id       # Get single outvert with Taka list
PUT    /api/v1/firms/:firmId/mill-outverts/:id       # Update + re-sync ProductionInfo
DELETE /api/v1/firms/:firmId/mill-outverts/:id       # Soft delete + clear mill fields in ProductionInfo
```

### Mill Inverts (firm-scoped)

```
GET    /api/v1/firms/:firmId/mill-inverts            # ?search= &mill= &date_from= &date_to=
POST   /api/v1/firms/:firmId/mill-inverts            # Create + sync ProductionInfo (atomic)
GET    /api/v1/firms/:firmId/mill-inverts/:id        # Get single invert with Taka list
PUT    /api/v1/firms/:firmId/mill-inverts/:id        # Update + re-sync ProductionInfo
DELETE /api/v1/firms/:firmId/mill-inverts/:id        # Soft delete + clear invert fields in ProductionInfo
```

### Auto-generated Views (firm-scoped, GET only)

```
GET    /api/v1/firms/:firmId/machine-info            # ?search= &machine_no=
GET    /api/v1/firms/:firmId/mill-summary            # ?search= &mill= &status= &date_from= &date_to=
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
7. firmScopeMiddleware       — applied only to firm-scoped routes — checks req.user.firmId === req.params.firmId (skipped for admin)
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

### Rule 6 — Firm scoping on every DB query

Every query on a firm-scoped resource must include `firmId` in the where clause.
The `firmId` always comes from `req.user.firmId` (not from req.params, not from req.body).

```typescript
// CORRECT
const beams = await prisma.beam.findMany({
  where: { firmId: req.user.firmId, deletedAt: null },
});

// WRONG — never trust firmId from params directly in the DB query
const beams = await prisma.beam.findMany({
  where: { firmId: req.params.firmId },
});
```

### Rule 7 — User registration flow

New users who self-register via `POST /auth/register` are created with `status: "pending"` and
cannot log in until an admin approves them. Two exceptions auto-approve immediately:

1. **First-time setup** — if no user with a `SUPER_ADMIN_EMAILS` email exists in the DB yet,
   the first registrant is auto-approved regardless of their email.
2. **Super admin email** — if the registrant's email is in `SUPER_ADMIN_EMAILS` env var,
   they are auto-approved with `role: "admin"`.

Admin-created users (`POST /auth/users`) are always `status: "active"` — they skip the pending flow entirely.

---

## 10. Search & Filter Pattern

Every list route accepts a `?search=` query param that runs an `ILIKE` search
across all relevant text columns using Prisma's `OR` filter.

```typescript
// Standard search pattern — adapt columns per module
const where = {
  firmId: req.user.firmId,
  deletedAt: null,
  ...(search && {
    OR: [
      { beamNo: { contains: search, mode: "insensitive" as const } },
      { beamQuality: { contains: search, mode: "insensitive" as const } },
    ],
  }),
  // Additional filters from query params:
  ...(quality && { beamQuality: quality }),
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
Payload: `{ userId, firmId, role, email }`.

**Refresh token:** JWT signed with `JWT_REFRESH_SECRET`, expires in `7d`.
Stored in httpOnly cookie: `{ httpOnly: true, secure: true, sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 }`.

**Roles:**

- `admin` — no firmId in token, bypasses firmScope middleware, can access all firms
- `firm_manager` — has firmId in token, full CRUD within their firm
- `operator` — has firmId in token, can only create/read ProductionInfo

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
 * /api/v1/firms/{firmId}/beams:
 *   get:
 *     summary: List beams for a firm
 *     tags: [Beams]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: firmId
 *         required: true
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
router.get("/", authMiddleware, firmScopeMiddleware, async (req, res) => {
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

## 15. What NOT to Do

- Do NOT use `any` type anywhere in TypeScript
- Do NOT use `prisma.model.delete()` — always soft delete
- Do NOT trust `firmId` from `req.params` or `req.body` for DB queries — use `req.user.firmId`
- Do NOT write mill sync logic inside route handlers — put it in service files
- Do NOT create/update `ProductionInfo` and `Taka` in separate DB calls — always use `prisma.$transaction`
- Do NOT return `passwordHash` in any response — exclude it explicitly
- Do NOT skip `deletedAt: null` in any findMany/findFirst query
- Do NOT use `console.log` for errors — use `console.error` in dev; replace with a logger in prod
- Do NOT mutate `req.body` directly — destructure it first into typed variables
- Do NOT hardcode super admin emails anywhere — always use `getSuperAdminEmails()` from `src/lib/superAdmin.ts`
- Do NOT `await` email sends on the critical response path — fire-and-forget with `.catch((err) => console.error(...))`
