# Deployment (Railway + PostgreSQL)

This app is a **full-stack Next.js** app with **API routes**, **middleware**, and **PostgreSQL**. It cannot run on static hosts (e.g. GitHub Pages alone).

**Recommended setup:** [Railway](https://railway.app) for the Next.js service **and** a Railway **PostgreSQL** database (one project, two services). This repo includes [`railway.json`](../railway.json) so build, migrations, and start commands are defined in code.

**Quick PoC:** copy [`deployment/railway-poc-raw-editor.env`](../deployment/railway-poc-raw-editor.env) into the web service Raw Editor — see [`deployment/RAILWAY_POC.md`](../deployment/RAILWAY_POC.md).

---

## What you will create (big picture)

1. A **Railway project** (like a folder for your apps).
2. A **PostgreSQL** database on Railway (managed Postgres).
3. A **web service** that runs this GitHub repo (builds Next.js and runs `next start`).
4. Railway will connect the database to the app and inject **`DATABASE_URL`** automatically once you link them.

You will also set a few **environment variables** (secrets and your public URL).

---

## Step 1 — Push this code to GitHub

Railway deploys from a **Git repository**. If your code is not on GitHub yet:

1. Create a repo on GitHub (empty is fine).
2. In your project folder on your computer, run (replace `YOUR_USER` and `YOUR_REPO`):

   ```bash
   git remote add origin https://github.com/YOUR_USER/YOUR_REPO.git
   git push -u origin main
   ```

If the repo already exists, just **push the latest `main`** after pulling these changes.

---

## Step 2 — Create a Railway project and database

1. Log in at [railway.app](https://railway.app) (same account as your paid plan).
2. Click **New Project**.
3. Choose **Empty Project** (or **Provision PostgreSQL** if you see it—we still add the app next).

### Add PostgreSQL

1. In the project, click **Create** or **+ New**.
2. Select **Database** → **PostgreSQL**.
3. Wait until it shows as **Active**. You do **not** need to copy SQL or create tables by hand; Prisma migrations will create them on deploy.

---

## Step 3 — Deploy this repository as a web service

1. In the **same Railway project**, click **Create** / **+ New** → **GitHub Repo**.
2. Authorize Railway to read your GitHub if asked.
3. Select the **Soka-Scheduler** (or `soka-scheduling`) repository.
4. Railway will detect Node/Next and use **`railway.json`** for:
   - **Build:** `npm run build`
   - **Pre-deploy:** `npm run db:migrate:deploy` (applies Prisma migrations)
   - **Start:** `npm run start` (listens on `PORT`, binds `0.0.0.0`)

---

## Step 4 — Connect the database to the app

The web service must receive **`DATABASE_URL`**.

1. Open your **PostgreSQL** service → **Variables** (or **Connect**).
2. Railway usually shows a variable like **`DATABASE_URL`** or **`POSTGRES_URL`**.
3. Open your **web service** (the Next.js app) → **Variables** → **Add variable reference** (or **Raw editor**).
4. **Reference** the Postgres service’s `DATABASE_URL` into the web service so the app and pre-deploy migration use the same value.

If Railway does not auto-link:

- Copy **Postgres connection URL** from the database’s **Connect** tab.
- On the web service, add variable **`DATABASE_URL`** = that URL (no extra quotes).

**Important for builds:** If `npm run build` fails during `prisma generate` with a missing `DATABASE_URL`, enable that variable for the **build** phase as well (Railway: variable → **Available at build time** / include in build—wording may vary).

---

## Step 5 — Environment variables on the web service

In the **web** service → **Variables**, add (names must match exactly):

| Name | What to put |
|------|----------------|
| `JWT_SECRET` | Run on your Mac: `openssl rand -base64 32` — paste the output. |
| `ADMIN_EMAIL` | Email you use for env-based admin login (e.g. your `@soka.edu`). |
| `ADMIN_PASSWORD` | Strong password for that admin account. |
| `NEXT_PUBLIC_APP_URL` | Your app’s **public URL** from Railway (e.g. `https://something.up.railway.app`) — **no trailing slash**. After the first deploy, open the service → **Settings** → **Networking** → generate **Public URL**, then set this and redeploy. |

Optional (email):

| Name | Notes |
|------|--------|
| `EMAIL_PROVIDER` | `console` \| `emailjs` \| `resend`. If **omit**: uses Resend when `RESEND_API_KEY` is set; else EmailJS when all `EMAILJS_*` are set; else console. Set **`emailjs`** for PoC when you do not have DNS for Resend; set **`resend`** when the school domain is verified. |

**EmailJS (PoC, no DNS on your domain)**

Works through [EmailJS](https://www.emailjs.com): you connect a personal Gmail (or other) **email service** in their dashboard—no SPF/DKIM on `soka.edu` required.

1. Create an account → **Email Services** → add your SMTP (e.g. Gmail).
2. **Email Templates** → new template. Map content to these **template parameters** (exact names):
   - **`to_email`** — set the template’s “To” field to `{{to_email}}`.
   - **`email_subject`** — subject line `{{email_subject}}`.
   - **`email_body`** — plain text `{{email_body}}`.
   - **`email_html`** — Same as plain body (newlines preserved). In your template, wrap with  
     `<div style="white-space:pre-wrap;">{{email_html}}</div>`  
     so line breaks render. Do **not** rely on `<br>` inside `{{email_html}}` — EmailJS escapes it and recipients see literal `&lt;br&gt;`.
3. **Account** → copy **Public Key** and **Private Key** (private key is required for server-side REST calls).
4. **Security (required for Railway / Next.js API routes):** EmailJS blocks server-side REST calls by default. Open [EmailJS Account → Security](https://dashboard.emailjs.com/admin/account/security) and **enable** “Allow API access for non-browser applications” (wording may vary). Without this, invites return **403** and logs show `API access from non-browser environments is currently disabled`.
5. Railway → **`EMAIL_PROVIDER`** = `emailjs`, plus **`EMAILJS_SERVICE_ID`**, **`EMAILJS_TEMPLATE_ID`**, **`EMAILJS_PUBLIC_KEY`**, **`EMAILJS_PRIVATE_KEY`** (from the EmailJS dashboard). Do not commit these.

**Switching to Resend later:** set **`EMAIL_PROVIDER`** = `resend`, add **`RESEND_API_KEY`** and **`EMAIL_FROM`**, and remove or leave EmailJS vars unused.

### Resend (production — school domain)

1. Create a [Resend](https://resend.com) account and an **API key**.
2. In Resend, add and verify your **domain** (DNS at your institution).
3. Railway → **`EMAIL_PROVIDER`** = `resend` (recommended once DNS is ready), **`RESEND_API_KEY`**, **`EMAIL_FROM`** on the verified domain.
4. Redeploy; check Resend’s dashboard for bounces/errors.

**Secrets:** Never commit API keys; rotate any key ever pasted into chat or a ticket.

---

## Step 6 — First deploy and public URL

1. Trigger a **Deploy** (push to `main` or **Redeploy** in Railway).
2. Watch **Deployments** → **Build logs** and **Deploy logs**. Pre-deploy should run migrations; start should show Next listening on `PORT`.
3. **Networking:** Enable **Public networking** and copy the **HTTPS URL**.
4. Set **`NEXT_PUBLIC_APP_URL`** to that URL (Step 5) and **redeploy** once so invitation links and redirects use the right host.

---

## Step 7 — Seed data (first time only)

Migrations create **empty** tables. To load default programs, terms, and admin/test users (same as local `npm run db:seed`):

On your **Mac**, in the project folder:

```bash
# Paste your Railway DATABASE_URL for one command only (from Railway Postgres Variables),
# or export it for the session:
export DATABASE_URL='postgresql://...'

npx prisma migrate deploy   # no-op if already applied
npm run db:seed
```

Use the **same** `DATABASE_URL` Railway uses. After this, you can log in with the seeded accounts or `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Step 8 — Optional: GitHub Pages notice site

The repo can still publish a **static** notice page (not the app). Edit `standalone/github-pages-notice/index.html` and set your **Railway public URL** where it says to replace the placeholder. See the same file for enabling the GitHub Actions workflow.

---

## Troubleshooting

| Problem | What to check |
|--------|----------------|
| Build fails on Prisma | `DATABASE_URL` available at **build** time; `postinstall` runs `prisma generate`. |
| Pre-deploy fails | `DATABASE_URL` set on the **web** service; Postgres running. |
| App crashes on start | Logs for `PORT`; `railway.json` start command is `npm run start`. |
| 503 / DB errors in browser | Login page may show a **detail** line; check Railway **Deploy logs**. |
| Health check fails | `healthcheckPath` is `/` in `railway.json`; ensure home page returns 200 without blocking (middleware allows `/`). |
| Invite / email **500**, logs: `EmailJS send failed: 403` / non-browser | Enable **non-browser API access** in [EmailJS → Account → Security](https://dashboard.emailjs.com/admin/account/security). |
| Invite saves row but no email / generic 500 | Fixed in app: failed sends **roll back** the invitation and return **502** with `details`. Check template **To** = `{{to_email}}`, **Subject** = `{{email_subject}}`, body uses `{{email_html}}`. Check EmailJS **Logs** and Railway deploy logs for the real error. |
| EmailJS **400** “template ID not found” | The template must belong to the **same** EmailJS account as **`EMAILJS_PUBLIC_KEY`** (and matching private key). Re-copy **Public Key** from [Account → General](https://dashboard.emailjs.com/admin/account). In Railway, re-paste **`EMAILJS_SERVICE_ID`** from **Email Services** (must exist in that account). Remove stray **quotes/spaces** from variable values (the app trims these; redeploy after fixing). |

---

## Security checklist

- Strong **`JWT_SECRET`** and **`ADMIN_PASSWORD`**.
- Rotate any secret ever pasted into chat or screenshots.
- Prefer **Resend** (or similar) for real email if testers need magic links without reading server logs.

---

## Other hosts

The same app can run on **Render**, **Fly.io**, **Vercel + external Postgres**, etc.: Node 20, `npm run build`, `npx prisma migrate deploy`, `npm run start` with **`PORT`**, and the same env vars as above.
