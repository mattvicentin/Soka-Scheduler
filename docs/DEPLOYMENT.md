# Deployment (sharing a test URL with users)

## GitHub Pages cannot run this application

[GitHub Pages](https://docs.github.com/pages/getting-started-with-github-pages/about-github-pages) serves **static files only** (HTML, CSS, client JS). It does **not**:

- Run a **Node.js** server
- Execute **Next.js API routes** (`/api/*`)
- Connect to **PostgreSQL**
- Run **middleware** (auth cookies, JWT)

Soka Scheduling is a **full-stack** Next.js app with a database. **There is no supported way to host the working app on GitHub Pages** without rewriting it as a separate static front end and a hosted API elsewhere.

**What we provide instead:**

1. **Recommended:** Deploy the real app to **Vercel** (or similar) — free tier, connects to your GitHub repo, gives you a URL like `https://your-project.vercel.app` for testers.
2. **Optional:** A tiny **informational** site on GitHub Pages (this repo includes a workflow) that explains the above and points people to your Vercel URL once you set it.

---

## Option A — Vercel (recommended for “test with other users”)

### 1. Create a PostgreSQL database

Use any hosted Postgres (examples):

- [Neon](https://neon.tech) (free tier)
- [Supabase](https://supabase.com) (database only)
- [Railway](https://railway.app)

Copy the connection string (often needs `?sslmode=require`).

### 2. Import the project in Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Add New Project** → import **Soka-Scheduler** (or your repo name).
3. **Framework Preset:** Next.js (auto-detected).
4. **Root directory:** `.` (default).

### 3. Environment variables (Vercel → Project → Settings → Environment Variables)

Add the same variables you use locally (see [.env.example](../.env.example)):

| Name | Notes |
|------|--------|
| `DATABASE_URL` | Production Postgres URL |
| `JWT_SECRET` | `openssl rand -base64 32` |
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Strong password for seed |
| `NEXT_PUBLIC_APP_URL` | **Your Vercel URL**, e.g. `https://soka-scheduler.vercel.app` (no trailing slash) |
| `EMAIL_PROVIDER` | `console` logs magic links in Vercel **function logs**; use `resend` + `RESEND_API_KEY` for real email |

Apply to **Production** (and **Preview** if you want preview deployments to work with auth).

### 4. First-time database setup

After the first successful deploy (or from your machine against the **same** `DATABASE_URL`):

```bash
# From your laptop, with DATABASE_URL pointing at production:
npx prisma migrate deploy
npm run db:seed
```

Or use Vercel CLI / a one-off script — the important part is **migrations + seed** run once against that database.

### 5. Redeploy

Trigger a redeploy in Vercel after changing env vars (especially `NEXT_PUBLIC_APP_URL`).

### Build notes

- **`postinstall`** runs `prisma generate` so the Prisma client exists during `next build` on Vercel.
- **`vercel.json`** pins the Node.js version for consistent builds.

---

## Option B — Other hosts

Any platform that runs **Node.js** and supports **Next.js** + **long-lived connections to Postgres** can work (e.g. **Railway**, **Render**, **Fly.io**, **AWS**). The same env vars and `prisma migrate deploy` + seed apply.

---

## Optional — GitHub Pages “info” site only

This repo includes:

- `standalone/github-pages-notice/index.html` — short page explaining that the app is not on Pages.
- `.github/workflows/github-pages.yml` — publishes that folder to **GitHub Pages** via Actions.

### Enable it

1. Repo **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions**.
2. Push to `main` (or run the workflow manually). The **Deploy GitHub Pages** workflow will run.
3. After it succeeds, the site URL will be like:  
   `https://<user>.github.io/<repo>/`

Edit `standalone/github-pages-notice/index.html` and replace `YOUR_VERCEL_URL_HERE` with your real Vercel URL so testers have one click to the app.

**This is not the scheduling app** — only a landing page. The app itself stays on Vercel (or another Node host).

---

## Security checklist (public test)

- Use a **strong** `JWT_SECRET` and `ADMIN_PASSWORD`.
- Prefer **Resend** (or similar) for email instead of `console` if testers must complete invitation flows without access to server logs.
- Rotate secrets if they were ever committed or shared.
