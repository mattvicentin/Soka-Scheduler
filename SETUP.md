# Setup guide & dependencies

This document lists **everything required** to run **Soka Scheduling** locally or in production, including runtime tools, npm packages, environment variables, and database steps.

For a shorter overview, see [README.md](./README.md).

---

## 1. Runtime prerequisites (install on your machine or server)

| Requirement | Version / notes | Why |
|---------------|-----------------|-----|
| **Node.js** | **18.x or 20.x** (LTS recommended) | Runs Next.js, Prisma CLI, scripts |
| **npm** | Bundled with Node (9+) | Installs dependencies and runs scripts |
| **PostgreSQL** | **15+** recommended | Application database |
| **OpenSSL** (optional CLI) | Any | Used to generate `JWT_SECRET`: `openssl rand -base64 32` |

**Optional (only if you run specific commands):**

| Tool | When needed |
|------|-------------|
| **Playwright browsers** | `npm run test:e2e` — after `npm install`, run `npx playwright install` |

---

## 2. Production dependencies (`dependencies` in `package.json`)

These are installed with `npm install` and are required at **runtime** (and for `next build`).

| Package | Version (approx.) | Role |
|---------|-------------------|------|
| **next** | ^14.2.0 | Web framework (App Router, API routes, middleware) |
| **react** | ^18.2.0 | UI |
| **react-dom** | ^18.2.0 | UI rendering |
| **@prisma/client** | ^5.22.0 | Database ORM (generated client) |
| **bcryptjs** | ^2.4.3 | Password hashing |
| **jose** | ^5.9.0 | JWT creation/verification |
| **zod** | ^3.23.0 | Request/body validation |
| **jspdf** | ^2.5.2 | PDF generation (exports/reports) |
| **jspdf-autotable** | ^3.8.3 | PDF tables |
| **pdf-parse** | ^1.1.1 | PDF text extraction (catalog import tooling) |

Exact versions resolve from `package-lock.json` (or your lockfile) after `npm install`.

---

## 3. Development dependencies (`devDependencies`)

Needed for **local development**, **tests**, and **build tooling** — not strictly required on a minimal production server if you only deploy a prebuilt `.next` output, but typically the same `npm install` is used in CI.

| Package | Version (approx.) | Role |
|---------|-------------------|------|
| **typescript** | ^5.0.0 | Type checking |
| **prisma** | ^5.22.0 | CLI: `migrate`, `generate`, `studio` |
| **tsx** | ^4.19.0 | Run TypeScript scripts (`seed`, imports) |
| **eslint** | ^8.57.0 | Linting |
| **eslint-config-next** | ^14.2.0 | Next.js ESLint rules |
| **tailwindcss** | ^3.4.0 | CSS utility framework |
| **autoprefixer** | ^10.4.20 | PostCSS / Tailwind pipeline |
| **@types/node** | ^20.0.0 | TypeScript types for Node |
| **@types/react** | ^18.2.0 | TypeScript types for React |
| **@types/react-dom** | ^18.2.0 | TypeScript types for React DOM |
| **@types/bcryptjs** | ^2.4.6 | Types for bcryptjs |
| **vitest** | ^2.0.0 | Unit/integration tests |
| **@vitest/coverage-v8** | ^2.0.0 | Test coverage |
| **@playwright/test** | ^1.49.0 | End-to-end tests |

---

## 4. Environment variables

Copy the template and edit:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | **Yes** | PostgreSQL URL, e.g. `postgresql://USER:PASSWORD@localhost:5432/soka_scheduling` |
| `JWT_SECRET` | **Yes** (prod & normal auth) | Secret for signing JWTs; generate with `openssl rand -base64 32` |
| `ADMIN_EMAIL` | **Yes** for seed | First admin login email |
| `ADMIN_PASSWORD` | **Yes** for seed | Admin password; seed creates/updates this account |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Public base URL (invitation links). Local: `http://localhost:3000` |
| `EMAIL_PROVIDER` | No | `console` (default) logs mail to terminal; or `resend` |
| `RESEND_API_KEY` | No | If set, real email via Resend |
| `EMAIL_FROM` | No | Sender when using Resend |
| `NODE_ENV` | No | `development` / `production` |

**Never commit `.env`** — it is listed in `.gitignore`. For GitHub Actions or hosting, configure secrets there.

---

## 5. Database setup (required)

1. Create an empty PostgreSQL database (e.g. `soka_scheduling`).
2. Put the connection string in `DATABASE_URL` in `.env`.
3. From the project root:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```

- **`db:generate`** — generates the Prisma Client from `prisma/schema.prisma`.
- **`db:migrate`** — applies SQL migrations (creates/updates tables). Use `db:migrate:deploy` in CI/production.
- **`db:seed`** — loads baseline data (programs, terms, system config, admin user from `ADMIN_*` env vars).

---

## 6. Run the app

**Development:**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If you see webpack chunk errors after many edits, use:

```bash
npm run dev:clean
```

**Production build (smoke test locally):**

```bash
npm run build
npm run start
```

---

## 7. Useful npm scripts (reference)

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run dev:clean` | Clear `.next` + tool cache, then dev |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run test:e2e` | Playwright (install browsers first) |
| `npm run db:studio` | Prisma Studio GUI |
| `npm run db:import` | Import `prisma/import-data.json` |
| `npm run db:set-passwords` | **Dev only** — reset all account passwords (see script) |

---

## 8. Sharing a public test URL (not GitHub Pages for the app)

The running app requires a **Node host** and **Postgres**. See **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** for **Vercel** setup. GitHub Pages can only host the optional static **notice** page in this repo, not the Next.js app itself.

---

## 9. Pushing to GitHub — checklist

- [ ] `.env` is **not** committed (verify with `git status`).
- [ ] **Secrets** live in GitHub **Actions secrets** / hosting provider env, not in the repo.
- [ ] Commit **`prisma/migrations/`** and **`migration_lock.toml`** so others can run `prisma migrate deploy`.
- [ ] Optional: add a **`.nvmrc`** or **engines** in `package.json` if you want to pin Node for the team.

---

## 10. External services (optional)

| Service | When |
|---------|------|
| **Resend** (or another provider) | Production email for invitations and verification codes |
| **Managed PostgreSQL** | Railway, Supabase, AWS RDS, etc., for staging/production |

---

## 11. Troubleshooting

| Issue | What to try |
|-------|-------------|
| `Cannot find module './NNNN.js'` (Next dev) | `npm run dev:clean` or delete `.next` and restart dev |
| Prisma errors after clone | `npm install` then `npm run db:generate` |
| Migration errors | Ensure `DATABASE_URL` points at the correct DB; use `db:migrate:deploy` in prod |

For architecture and domain concepts, see [docs/architecture.md](./docs/architecture.md) (if present).
