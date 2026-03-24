# Soka Academic Scheduling

Internal web application for faculty teaching preferences, teaching load enforcement, and multi-tier approval workflow (**Professor → Director → Dean**).

| Doc | Purpose |
|-----|---------|
| **This README** | Quick start, scripts, testing checklist, deployment notes |
| **[SETUP.md](./SETUP.md)** | **Full dependency list**, environment variables, GitHub checklist, troubleshooting |
| **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** | **Share a test URL** (Vercel + Postgres). Why GitHub Pages cannot run this app. |

**Sharing the app with testers:** GitHub Pages only hosts static files; this stack needs **Vercel** (or similar) + **PostgreSQL**. Follow [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). Optional: enable the **Deploy GitHub Pages** workflow for a small info page at `https://<you>.github.io/<repo>/`.

---

## Prerequisites

- **Node.js** 18+ (20 LTS recommended)
- **PostgreSQL** 15+
- **npm**

---

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (e.g. `postgresql://user:password@localhost:5432/soka_scheduling`) |
| `JWT_SECRET` | Yes | Generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Yes (for seed) | Admin login email (default: admin@soka.edu) |
| `ADMIN_PASSWORD` | Yes (for seed) | Admin password; required for seed to create admin account |
| `NEXT_PUBLIC_APP_URL` | Yes | App URL for invitation links. Local: `http://localhost:3000` |
| `EMAIL_PROVIDER` | No | `console` (default) or `resend` |
| `RESEND_API_KEY` | No | If set, Resend mode is used for real email delivery |
| `EMAIL_FROM` | No | From address when using Resend (default: noreply@soka.edu) |

### 3. Database setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates tables)
npx prisma migrate dev

# Seed: system_config, programs, terms, sample faculty, admin account
npm run db:seed
```

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

A concise env table is in the setup steps above. For the full variable list and dependency tables, see **[SETUP.md](./SETUP.md)**.

---

## GitHub & secrets

- **Do not commit** `.env` (it is gitignored). Use **repository / organization secrets** or your host’s env UI for `DATABASE_URL`, `JWT_SECRET`, `ADMIN_*`, etc.
- Commit **`prisma/migrations/`** and **`prisma/migrations/migration_lock.toml`** so CI and teammates can run `prisma migrate deploy`.
- Typical CI job: `npm ci` → `npm run db:generate` → `npm run db:migrate:deploy` (with `DATABASE_URL` secret) → `npm run build`.

---

## Database commands

| Command | Description |
|---------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run migrations (dev; creates migration files) |
| `npm run db:migrate:deploy` | Apply migrations (production/staging) |
| `npm run db:seed` | Seed database |
| `npm run db:import` | Import faculty and courses from `prisma/import-data.json` |
| `npm run db:clear-faculty-courses` | Remove all faculty, courses, offerings, proposals, invitations (keeps programs, terms, admin) |
| `npm run db:push` | Push schema without migrations |
| `npm run db:studio` | Open Prisma Studio |

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Next.js dev server |
| `npm run dev:clean` | Clear `.next` / caches, then dev (fixes stale webpack chunks) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest unit/integration tests |
| `npm run test:watch` | Vitest watch mode |
| `npm run test:e2e` | Run Playwright E2E tests (`npx playwright install` first) |

---

## Local Testing Checklist

After setup, verify these flows work locally:

1. **Admin login** — Log in at `/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. You should land on the dean dashboard.

2. **Faculty invitation creation** — As admin (dean), go to Invitations, create an invitation for the sample faculty (`professor@test.edu`). In console mode, the invitation link is logged to the terminal.

3. **Invitation acceptance** — Open the invitation link (from console log), enter email `professor@test.edu` and a password, submit. Account is created.

4. **Verification code login** — The verification code is logged to the console. Go to `/verify`, enter email and code, submit. You should land on the professor dashboard.

5. **Professor dashboard access** — As professor, view dashboard, offerings, proposal, fairness.

6. **Director dashboard access** — Create a director account (dean creates faculty + invitation, or assign director role to an account). Log in and access director dashboard, calendar, approvals.

7. **Dean dashboard access** — As admin/dean, access faculty, courses, calendar, proposals, accounts, invitations.

---

## Staging Deployment

### Production database

1. Create a PostgreSQL database (e.g. on Railway, Supabase, or your provider).
2. Set `DATABASE_URL` to the connection string.
3. Ensure `NODE_ENV=production` and `NEXT_PUBLIC_APP_URL` points to your staging URL.

### Apply migrations

```bash
npx prisma migrate deploy
```

### Seed and import (optional)

Run seed once to populate system_config, programs, terms:

```bash
npm run db:seed
```

To import faculty and courses from catalog data:

1. **From PDFs**: Place Soka schedule PDFs in a folder, then run:
   ```bash
   npm install
   npm run db:extract-pdfs
   ```
   Or: `npx tsx scripts/extract-from-pdfs.ts /path/to/pdfs` to specify a directory.
   This generates `prisma/import-data.json` from the PDFs.

2. **Import to database**:
   ```bash
   npm run db:import
   ```

The import is idempotent: it skips existing faculty (by email) and course templates (by course_code).

### Build and start

```bash
npm run build
npm run start
```

### Environment variables for staging

- `DATABASE_URL` — Production PostgreSQL URL
- `JWT_SECRET` — Strong random secret
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — Admin credentials
- `NEXT_PUBLIC_APP_URL` — Staging URL (e.g. `https://scheduling-staging.example.com`)
- `RESEND_API_KEY` — For real email delivery
- `EMAIL_FROM` — Verified sender domain

---

## Project structure

```
soka-scheduling/
├── SETUP.md                # Dependencies, env, GitHub checklist
├── app/                    # Next.js App Router
│   ├── (auth)/             # Login, accept-invitation, verify
│   ├── (dashboard)/        # Main app (professor, director, dean)
│   └── api/                # API routes
├── lib/
│   ├── auth/               # Password, JWT, session, middleware
│   ├── constants/          # Roles, statuses, config keys
│   ├── db/                 # Prisma client
│   ├── config.ts           # system_config helpers
│   ├── validation/         # Schedule validation rules
│   └── services/           # Load, fairness, heatmap, export
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── migrations/         # SQL migrations (commit to git)
│   └── seed.ts             # Seed script
├── scripts/                # One-off / import utilities
└── docs/
    └── architecture.md     # Architecture overview
```

---

## Architecture

- **Identity:** `faculty` (employment) + `accounts` (login). Faculty exists before account.
- **Courses:** `course_templates` + `course_offerings`; `course_template_programs` (cross-listing); `course_offering_instructors` (team teaching).
- **Scheduling:** `schedule_versions` (draft/official), `schedule_slots`, `schedule_proposals`.
- **Auth:** JWT Bearer tokens; admin via env; faculty via invitation + verification code.

See `docs/architecture.md` for details.
