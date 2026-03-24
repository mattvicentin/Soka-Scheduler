# Railway PoC — paste into **Soka-Scheduler** only

1. Open Railway → project **perfect-grace** (or yours) → service **Soka-Scheduler** → **Variables** → **Raw Editor**.
2. **Replace the entire contents** with the file **`railway-poc-raw-editor.env`** in this folder (copy all lines).
3. In Railway → **Soka-Scheduler** → **Settings** → **Networking** → generate your **public URL**.
4. Edit variables again: set **`NEXT_PUBLIC_APP_URL`** to that exact URL including **`https://`** (e.g. `https://soka-scheduler-production.up.railway.app`) — not `soka-scheduler…` alone. No trailing slash. Save and redeploy.
5. **Do not** paste this into the **Postgres** service — Railway manages Postgres variables.

**PoC login (after `npm run db:seed` against this DB):** use **`ADMIN_EMAIL`** / **`ADMIN_PASSWORD`** from that file, or seeded accounts from your seed script.

**Security:** These values are for a throwaway PoC. Rotate everything if the repo or Railway project is ever shared publicly.
