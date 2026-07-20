# SkillForCareer LMS

Enterprise Learning Management System with integrated video conferencing —
pre-recorded, live, offline and hybrid courses, assessments, certificates,
payments and analytics.

Built on **Next.js 16 · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Prisma 7 · TiDB Cloud**. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for
the full design.

## Getting started

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Configure environment
cp .env.example .env      # then fill in DATABASE_URL, SMTP, JWT secrets

# 3. Create the application database on TiDB (uses BOOTSTRAP_DATABASE_URL)
npm run db:create

# 4. Sync the schema (full model lands in Step 2)
npm run db:push

# 5. Run the dev server
npm run dev               # http://localhost:3000
```

> **Note:** the client's TiDB URL points at the `sys` schema, which Prisma
> cannot use. `DATABASE_URL` must target the `lms` database — `db:create` sets
> it up. Details in `docs/ARCHITECTURE.md`.

## Scripts

| Command             | Purpose                          |
| ------------------- | -------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack) |
| `npm run build`     | Production build                 |
| `npm run start`     | Serve the production build       |
| `npm run lint`      | ESLint                           |
| `npm run typecheck` | TypeScript check                 |
| `npm run db:create` | Create the `lms` database        |
| `npm run db:push`   | Push schema to the database      |
| `npm run db:studio` | Open Prisma Studio               |

## Build plan progress

- [x] **Step 1 — Project architecture** _(this step)_
- [ ] Step 2 — Prisma schema
- [ ] Step 3 — Authentication
- [ ] Step 4 — Dashboard layout
- [ ] Step 5 — Admin panel
- [ ] Step 6 — Course module
- [ ] Step 7 — Student module
- [ ] Step 8 — Instructor module
- [ ] Step 9 — Video conferencing
- [ ] Step 10 — Testing & optimization
