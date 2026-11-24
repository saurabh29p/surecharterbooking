# Go-live checklist (prepared, not run yet)

Everything below is **prepared, not done**. Nothing here has been changed on Railway, Vercel, DNS or Resend.
Work top to bottom; each step says who does it. "Me" steps happen only after you say "go" for that step.

Today the test setup is:
- **API:** Railway service `api` (Singapore). It deploys from the branch `claude/new-session-ox4tcm` and runs on
  `api-production-e90b9fa3.up.railway.app`.
- **Desk:** Vercel project `surecharterbooking`. It is reached through a branch preview link that sits behind Vercel
  login.
- **Data:** the test database and the `files` bucket hold test data: the end-to-end wedding, the "E2E" business
  profile and operator, a client-terms template approved for testing, and the PDFs from those runs.

The public website (`flyvaanika.com`, Vercel project `vaanika-site`) launches separately, only when you say
"launch": see WEBSITE.md §13 phase 6 and `apps/site/README.md`.

Plan for the day: about 1–2 hours, most of it waiting for DNS. Pick a quiet day, not one with a wedding flying.

---

## 0. Before the day (you)
- [ ] Have a password manager open (1Password, Bitwarden or similar). Two secrets go there before anything else.
- [ ] Buy `flyvaanika.com` (you), and know where its DNS is managed (GoDaddy, Cloudflare, Hostinger, Vercel and so on), and be
      able to log in.
- [ ] Decide two email addresses:
  - the sending address. I suggest `quotes@flyvaanika.com`; it doesn't need an inbox.
  - the reply-to inbox, where client replies should land.
- [ ] Have your Resend account ready (free plan is enough to start).

## 1. Merge to `main` and deploy from `main`
1. **Me:** open a pull request from `claude/new-session-ox4tcm` into `main` (only when you ask), and wait for CI to
   pass on it.
2. **You:** read the PR summary and merge it on GitHub ("Create a merge commit").
3. **Me:** switch the Railway `api` service's source branch from `claude/new-session-ox4tcm` to `main`.
   - Railway then builds from `main`.
   - Check: the deploy goes green and `/api/health` shows `"status":"ok","database":"ok"`.
4. **Me:** check that Vercel's production branch is `main`. The merge then makes a production deployment of the
   desk.
   - Check: the production deployment shows "Ready".
5. From now on, only `main` deploys. New work goes on a branch and a PR, as before.

## 2. Custom domains
`app.flyvaanika.com` is the desk (Vercel) and `api.flyvaanika.com` is the API (Railway).

1. **Me:** in Railway, `api` service → Networking → add custom domain `api.flyvaanika.com` (port 8080).
   - Railway shows **two records**, a `CNAME` and a `TXT` (verification). Both are required.
   - I send you both, exactly as shown.
2. **Me:** in Vercel, project → Domains → add `app.flyvaanika.com`, assigned to Production (`main`).
   - Vercel shows one record, usually a `CNAME` to its own target. I send you that too.
3. **You:** add the three records at your DNS provider.
   - If it is Cloudflare, set them to **"DNS only" (grey cloud)**, not proxied, so the certificates can be issued.
4. **Me:** wait until both domains show a valid certificate. That usually takes minutes, sometimes up to an hour.
   - Check: `https://api.flyvaanika.com/api/health` → ok
   - Check: `https://app.flyvaanika.com` shows the login page.
5. **Me:** point the desk at the new API address. In `apps/desk/vercel.json`, change both rewrite destinations from
   `https://api-production-e90b9fa3.up.railway.app` to `https://api.flyvaanika.com`, then commit, PR and merge.
   - Until this step, the desk keeps using the Railway address, so nothing breaks while DNS settles.
6. **Me:** set the Railway variables, then let it redeploy:
   - `DESK_ORIGIN=https://app.flyvaanika.com`
   - `PUBLIC_BASE_URL=https://app.flyvaanika.com`
   - `SITE_ORIGINS=https://flyvaanika.com,https://www.flyvaanika.com`

   Check: secure share links now start with `https://app.flyvaanika.com/s/…`.

## 3. Vercel protection
- The project uses Vercel's standard protection ("all except custom domains"). In practice:
  - `app.flyvaanika.com` is **public** as soon as it is added: no Vercel login, only the desk's own login.
  - Preview and branch links (`*.vercel.app`) **stay behind Vercel login**, which is what we want.
- **Me:** after step 2, open `https://app.flyvaanika.com` from a logged-out browser.
  - Check: it shows the Vaanika login, not a Vercel login.
  - If it shows a Vercel login, I change the project's Deployment Protection so it doesn't cover production custom
    domains. I don't turn protection off for previews.
- The desk is still marked `noindex`, so search engines won't list it.
- **Me:** remove the test share link (the one made for the speed measurements) in Vercel → Deployment Protection →
  Shareable links. It expires on 20 Nov anyway.

## 4. Email (Resend)
1. **You:** in Resend → Domains → Add domain → `flyvaanika.com`. Choose the region closest to India that Resend
   offers.
2. **You:** add the DNS records Resend lists at your DNS provider. Typically:
   - an `MX` and a `TXT` (SPF) record on a `send` subdomain
   - a `TXT` record for DKIM (`resend._domainkey`)
   - optionally a `TXT` DMARC record on `_dmarc` (`v=DMARC1; p=none;` to start)

   Click "Verify" and wait for all of them to be green.
3. **You:** in Resend → API keys → create a key with **"Sending access"** for `flyvaanika.com` only.
   - Paste it straight into Railway as `RESEND_API_KEY`. Not in chat.
4. **Me:** set `EMAIL_FROM=Vaanika <quotes@flyvaanika.com>` and `EMAIL_REPLY_TO=<your inbox>`.
5. Check (step 7 below): email a quote to yourself. It arrives with the PDF attached and isn't in spam, and Reply goes
   to your inbox.

## 5. Replace test secrets and wipe the test data
The live app starts from an **empty database and an empty bucket**. The test data never becomes "real".

1. **Me:** stop the API first (Railway → `api` → scale to 0, or remove the active deployment), so nothing writes
   during the wipe.
2. **Me:** wipe the test database: in Railway's Postgres → Data, run `DROP SCHEMA public CASCADE; CREATE SCHEMA
   public;`.
   - Alternatively, add a fresh Postgres service and point `DATABASE_URL` at it, then delete the old one a week later.
     I recommend the fresh service: the old one stays as a fallback for a few days.
3. **Me:** empty the `files` bucket (or create a new bucket `files-live`, repoint the `S3_*` references and delete the
   old bucket later).
4. **You:** create new secrets and paste them into Railway yourself. **Save each one in your password manager
   first.**
   - `JWT_SECRET`: `openssl rand -base64 48`. A new one logs out every test session.
   - `DATA_ENCRYPTION_KEYS`: `k1:` followed by `openssl rand -base64 32`.
     - ⚠️ **Store this in your password manager before you save it in Railway.**
     - If it is lost, every encrypted bank detail and guest ID becomes unreadable for good. No one, including me or
       Railway, can recover it.
   - `ADMIN_EMAIL`: your real login email. `ADMIN_PASSWORD`: a strong temporary password, at least 12 characters.
5. **Me:** delete the test-only variables: `TEST_ACCOUNT_EMAIL` and `TEST_ACCOUNT_PASSWORD`.
   - Without them, the automated test account is never created, and on the old database it would be switched off.
   - The deployed end-to-end script needs them, so I won't run it against the live app. It creates weddings, which
     would be live data.
6. **Me:** start the API again.
   - On first start it builds the empty database (migrations), creates your owner account from `ADMIN_EMAIL` /
     `ADMIN_PASSWORD`, and logs "Created the owner account".
   - The demo seed can't run here: `pnpm seed` refuses when `NODE_ENV=production`.

## 6. First login, then remove `ADMIN_PASSWORD`
1. **You:** on your phone, open `https://app.flyvaanika.com` and log in with `ADMIN_EMAIL` and the temporary
   password.
2. **You:** Settings → Security → change the password to your real one.
3. **Me (or you):** in Railway, **delete `ADMIN_PASSWORD`**. Railway redeploys. It's only used when the database has
   no users, but it shouldn't sit there.
4. **You:** complete the setup wizard (business profile: legal name, GSTIN, address, bank details, signatory) and
   upload the logo. The logo upload proves the bucket works.
5. **You:**
   - Settings → Tax: have your CA confirm the GST rate and SAC code. The warning banner stays until then.
   - Docs → templates: approve each agreement template **only after your lawyer has approved it**. The test approval
     was wiped with the test data.

## 7. Smoke test on the live app (you, with me watching the logs)
- [ ] Add one real operator, verify it (permit + insurance files), add its aircraft.
- [ ] Make a test wedding with your own name as the client, request rates, add a reply, choose, build and issue the
      quote: the PDF opens (proves Chromium on Railway).
- [ ] Share it to yourself on WhatsApp: the secure link opens on your phone; press "I accept"; it shows on Today.
- [ ] Email it to yourself: it arrives from `quotes@flyvaanika.com` with the PDF; reply reaches your inbox.
- [ ] Mark the test wedding Lost ("test"), then Clients → your test client → Their data → Erase.
- [ ] `https://app.flyvaanika.com` answers with `X-Robots-Tag: noindex` (not listed by Google).

## 8. Daily database backups
1. **Me (with your OK):** in Railway → Postgres service → **Backups**, turn on the **daily** schedule (Railway also
   offers weekly and monthly; keep daily + weekly).
   - Check: the first backup appears the next day.
2. **Optional:** Railway also offers **Point-in-Time Recovery** for Postgres. It can restore to any minute in about
   the last 4 weeks, which helps after a mistake between daily backups. It stores its archive in a Railway bucket, so
   it costs a little storage. I suggest turning it on once real weddings are in.
3. **Once in the first week:**
   - Restore a backup into a scratch database and open it, to prove backups actually work.
   - Download one copy (`pg_dump`) and keep it off Railway (e.g. your Google Drive, encrypted). A backup that lives
     only with the same provider isn't enough.
4. The bucket (PDFs, signed agreements, receipts) is separate from the database. Download a copy of it once a month
   for now.

## 9. After go-live
- [ ] First morning: Settings → Activity shows the 06:45 operator expiry check ran ("System").
- [ ] Remove the old test Postgres and bucket once you're happy (if step 5 used fresh ones).
- [ ] Keep `DATA_ENCRYPTION_KEYS`, `JWT_SECRET` and the database backup location written down in your password
      manager.

## Rolling back
- **API:** Railway → Deployments → previous good deploy → Redeploy. Migrations only add things, so an older version
  keeps working with the newer database.
- **Desk:** Vercel → Deployments → previous → Promote to production.
- **Domains:** if `api.flyvaanika.com` misbehaves, set `vercel.json` back to the Railway address (one commit). The
  desk works through it again while DNS is fixed.
