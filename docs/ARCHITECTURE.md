# SkillForCareer LMS — Architecture (Step 1)

Enterprise Learning Management System with integrated video conferencing.
Implements the **AppInventive LMS Build Plan (Draft v1.0)**. This document
covers the Step 1 foundation; later steps extend it.

## Stack

| Concern         | Choice                                                        |
| --------------- | ------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack) + React 19                 |
| Language        | TypeScript (strict)                                           |
| Styling         | Tailwind CSS v4 + shadcn/ui (**Base UI** variant)             |
| Icons           | lucide-react                                                  |
| ORM             | Prisma 7 (driver adapter, no query engine)                    |
| Database        | TiDB Cloud Serverless (MySQL-compatible) via `mariadb`        |
| Auth            | JWT (`jose`) + Email OTP, httpOnly cookies, RBAC              |
| State           | Zustand (UI only); server data via RSC / route handlers       |
| Forms           | React Hook Form + Zod                                         |
| Charts          | Recharts                                                      |
| Rich text       | TipTap                                                        |
| Realtime/Video  | Socket.io + WebRTC (architecture; built in Step 9)            |
| Email           | Nodemailer (Gmail SMTP app password)                          |
| Animation       | Framer Motion                                                 |

## Folder structure

```
src/
  app/
    (marketing)/        Public site (landing) + layout — SEO-friendly RSC
    (auth)/             Login / register / OTP / password reset shell
    (dashboard)/        admin · instructor · student shells (Steps 4–8)
    api/                REST route handlers (health now; more per step)
    layout.tsx          Root: fonts, metadata/SEO, providers
    loading|error|not-found.tsx   Global UI states
  components/
    ui/                 shadcn primitives (33 components)
    layout/             Header, footer, (sidebar/bottom-nav in Step 4)
    marketing/          Landing sections
    shared/             Reusable app primitives (EmptyState, ErrorState, …)
    providers/          Theme + Tooltip + Toaster composition
  config/               site · roles/permissions (RBAC) · navigation
  lib/
    api/                Response envelope, typed errors, route wrapper
    auth/               password · jwt · otp · rbac · session · cookies
    mail/               Nodemailer transport + HTML email templates
    db-config.ts        TiDB-safe mariadb pool config (TLS + timeouts)
    prisma.ts           Prisma singleton (mariadb driver adapter)
    env.ts              Zod-validated environment
    events.ts           Signed domain-event stream (→ separate CRM)
    logger.ts · constants.ts
  server/               services · repositories (business logic, Step 5+)
  stores/               Zustand stores
  types/                Cross-cutting types
  proxy.ts              Route-protection proxy (Next 16 "middleware")
prisma/schema.prisma    Datasource + generator (full model = Step 2)
scripts/create-db.*     Provision the `lms` database on TiDB
```

## Key decisions & non-obvious gotchas

### TiDB connection (three-layered gotcha)

The client-supplied `DATABASE_URL` points at TiDB's **`sys`** schema, which
Prisma rejects (`P3004`). The app uses a dedicated **`lms`** database, created
by connecting through the always-present `test` schema (`npm run db:create`).
See `src/lib/db-config.ts`:

- **Explicit TLS** — TiDB Cloud requires TLS, but the `mariadb` driver ignores
  the `sslaccept`/`ssl` URL params (a Prisma-ism), so `ssl` is set in the pool
  config directly.
- **Raised `connectTimeout`** — the driver's ~1 s default is too short for the
  cross-region TLS handshake to `ap-southeast-1`.

### Prisma 7 specifics

- The connection URL is **no longer allowed in `schema.prisma`** — it lives in
  `prisma.config.ts` (`datasource.url`) for the CLI, and the runtime client gets
  it from the **mariadb driver adapter** (`src/lib/prisma.ts`).
- The client generates to `src/generated/prisma` (new `prisma-client`
  generator); import `PrismaClient` from `@/generated/prisma/client`.
- `prisma.config.ts` does not auto-load `.env`; it does so explicitly and
  appends `sslaccept=strict` for the schema engine (db push / migrate).

### shadcn = Base UI variant

The installed shadcn components are built on **`@base-ui/react`**, not Radix.
Consequently: use the **`render`** prop (not `asChild`) for polymorphism, and
`TooltipProvider` takes **`delay`** (not `delayDuration`).

### Auth & RBAC

- JWT via `jose` (works in both Node and the Edge proxy). Access + refresh
  tokens in httpOnly cookies.
- Roles are a first-class CRUD entity ("All Roles Custom"); `src/config/roles.ts`
  is the canonical catalog that seeds the `Role`/`Permission` tables (Step 2) and
  types every permission check.
- `src/proxy.ts` enforces role-scoped access to `/admin`, `/instructor`,
  `/student`.

### CRM boundary

Sales/CRM is a **separate product**. The LMS owes it only a signed event stream
(`src/lib/events.ts`, HMAC-signed) — never a shared database.

## Scripts

| Command             | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Dev server (Turbopack)                         |
| `npm run build`     | Production build (typechecks)                  |
| `npm run lint`      | ESLint                                         |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run db:create` | Create the `lms` database on TiDB              |
| `npm run db:push`   | Sync Prisma schema → database                  |
| `npm run db:studio` | Prisma Studio                                  |

## Verified in Step 1

- `npm run build` — clean (TypeScript + lint pass, 5 routes + proxy).
- `GET /api/health` — `database.connected: true` against TiDB `lms`.
- `GET /` — 200, SEO title, dark/light theme.
- `GET /admin` — 307 → `/login?next=/admin` (proxy protection).
```
