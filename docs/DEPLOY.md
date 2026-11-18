# Deploying ShubhJets

How the live app is set up, what to create in which order, every setting, and the checks after it goes live.

## How it fits together

| Address | What | Where |
| --- | --- | --- |
| `app.shubhjets.com` | The desk (the app you use on your phone) | Vercel, from `apps/desk` |
| `api.shubhjets.com` | The API, PDFs, secure link pages, daily jobs | Railway, from the `Dockerfile` |
| (private) | Postgres database | Railway, same project |
| (private) | File storage (documents, logos, receipts, guest IDs) | Railway Storage Bucket |
| `shubhjets.com`, `www.` | The public website (built later, `apps/site`) | Vercel |
| email | Quotes and documents sent from the app | Resend, sending as `@shubhjets.com` |

- The desk calls the API **on its own address** (`app.shubhjets.com/api/…`): Vercel forwards `/api/*` and `/s/*`
  (secure share links) to `api.shubhjets.com`. Your login cookie is then first-party, so phones keep you logged in.
- Secure links sent to clients look like `https://app.shubhjets.com/s/…`.
- The website posts enquiries straight to `api.shubhjets.com/api/public/…` (allowed by `SITE_ORIGINS`).
- **One API instance.** Login limits and the daily jobs assume one copy; don't raise replicas.

The API image is tested: built from this `Dockerfile` and run in production mode against a fresh database and an
S3 bucket, it applied every migration, created the owner from `ADMIN_EMAIL`, started the daily jobs, rendered a
PDF with Chromium (0.4 s) and stored an upload in the bucket.

## Order of work

Each step lists who does it. "You" means only you can do it: an account, a payment, a password or a key.
**Never paste a password or key into chat**: enter it directly in Railway, Vercel or Resend.

### 1. Accounts (you)
1. **Railway**: the plan you are choosing, with a project for ShubhJets (e.g. `shubhjets`). Tell me the project name
   and confirm I may create the services in it.
2. **Vercel**: an account (Hobby is fine to start) connected to GitHub with access to this repository.
3. **Domain** `shubhjets.com`: tell me where it is registered and who manages its DNS (the registrar, Cloudflare or
   Vercel), and whether you can add DNS records there.
4. **Resend**: an account. Nothing else yet.
5. **An inbox** for replies (e.g. your Gmail or a Google Workspace / Zoho mailbox). Client replies to app emails go here.

### 2. Railway: database, bucket, API (me, with your OK)
1. Add **Postgres** to the project.
2. Add a **Storage Bucket** (private).
3. Add the **API service** from this GitHub repo (branch `main` once merged; `railway.json` sets the Dockerfile
   build, the `/api/health` check and restarts).
4. Set the variables below. You enter the secret ones yourself (marked **you**).
5. Deploy and watch the first boot: migrations run, the owner account is created.
6. Add the custom domain `api.shubhjets.com` (Railway shows a CNAME record for step 4).

### 3. Vercel: the desk (me, with your OK)
1. New project from this repo, **Root Directory `apps/desk`** (keep "include files outside the root" on: the desk
   uses `packages/shared`). `apps/desk/vercel.json` holds the build, the `/api` and `/s` forwarding and security
   headers.
2. Add the domain `app.shubhjets.com` (Vercel shows a CNAME record for step 4).

Until `api.shubhjets.com` works, the forwarding in `vercel.json` can point at the Railway address
(`https://<service>.up.railway.app`) for a first test.

### 4. DNS records (you, or me if the DNS is on Vercel and you connect it)
| Record | Name | Value |
| --- | --- | --- |
| CNAME | `app` | what Vercel shows (e.g. `cname.vercel-dns.com`) |
| CNAME | `api` | what Railway shows for the API's custom domain |
| (Resend) | `send`, `resend._domainkey` | the MX, SPF (TXT) and DKIM (TXT) records Resend shows in step 5 |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<your inbox>` (recommended) |

### 5. Email (you, then me)
1. In Resend, **add the domain `shubhjets.com`** and add its DNS records (step 4). Wait for "Verified".
2. Create an **API key** with "Sending access" only, and paste it into Railway as `RESEND_API_KEY` yourself.
3. I set `EMAIL_FROM` and `EMAIL_REPLY_TO` and send a test from the app to your inbox.

### 6. First login and setup (you)
1. Open `https://app.shubhjets.com`, log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. Then **delete `ADMIN_PASSWORD` from Railway** (it is only used on an empty database) and change your password in
   Settings → Security if you like.
3. The setup wizard: your real business details, GSTIN, bank account, logo.
4. Settings → Rules: check the defaults; GST stays "not confirmed" until your CA confirms.
5. Agreement templates stay drafts until your lawyer approves them.

## Railway variables (API service)

| Variable | Value | Who |
| --- | --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (private network) | me |
| `DATABASE_SSL` | `false` (private network) | me |
| `JWT_SECRET` | at least 32 random characters (`openssl rand -base64 48`) | **you** |
| `DATA_ENCRYPTION_KEYS` | `k1:` followed by 32 random bytes in base64 (`openssl rand -base64 32`). **Store a copy in your password manager before saving it.** | **you** |
| `ADMIN_EMAIL` | the email you log in with | **you** |
| `ADMIN_PASSWORD` | at least 12 characters; delete after first login | **you** |
| `DESK_ORIGIN` | `https://app.shubhjets.com` | me |
| `PUBLIC_BASE_URL` | `https://app.shubhjets.com` | me |
| `SITE_ORIGINS` | `https://shubhjets.com,https://www.shubhjets.com` | me |
| `TRUST_PROXY` | `true` | me |
| `STORAGE_DRIVER` | `s3` | me |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | references to the bucket's variables | me |
| `S3_REGION` / `S3_FORCE_PATH_STYLE` | `auto` / `false` | me |
| `RESEND_API_KEY` | from Resend (step 5) | **you** |
| `EMAIL_FROM` | `ShubhJets <quotes@shubhjets.com>` | me |
| `EMAIL_REPLY_TO` | your inbox | me (you tell me the address) |

`NODE_ENV=production` and `PORT` come from the image and Railway. The API refuses to start if storage is local, the
desk address isn't https, or a required setting is missing, and says which one.

## Go-live checklist

Before
- [ ] `DATA_ENCRYPTION_KEYS` saved in your password manager (losing it makes bank details and guest IDs unreadable)
- [ ] Railway Postgres backups switched on (plan permitting)
- [ ] CI green on the commit being deployed

Right after deploy
- [ ] `https://api.shubhjets.com/api/health` shows `"status":"ok","database":"ok"`
- [ ] Railway logs: "Created the owner account", "Background jobs started", no errors
- [ ] Log in on your phone at `https://app.shubhjets.com`; stay logged in after closing the browser
- [ ] `ADMIN_PASSWORD` deleted from Railway
- [ ] Setup wizard done; upload the logo (proves the bucket)
- [ ] Make a test wedding, request rates, build and issue a quote: the PDF opens (proves Chromium)
- [ ] Share the quote with yourself by WhatsApp: the secure link opens on your phone; "I accept" shows on Today
- [ ] Email the quote to yourself: it arrives with the PDF, from `quotes@shubhjets.com`, reply goes to your inbox
- [ ] Mark the test wedding lost; erase the test client (Their data → Erase)
- [ ] `https://app.shubhjets.com/` is not indexed (`X-Robots-Tag: noindex`)

First week
- [ ] Today shows the 06:45 operator expiry check ran (Settings → Activity, "System")
- [ ] Back up the database once by hand and restore it into a scratch database to be sure backups work

## Rolling back
- **API:** in Railway, Deployments → the previous good deploy → Redeploy. Migrations only add things, so the older
  version keeps working with the newer database.
- **Desk:** in Vercel, Deployments → previous → Promote to production.
