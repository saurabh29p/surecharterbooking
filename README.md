# ShubhJets — Wedding Charter Desk

Private jets for Indian destination weddings, sold through wedding planners.
A service of Indicgems Exim LLP.

This repo will hold:
- `apps/desk` + `apps/api`: the internal system (see [BRIEF.md](BRIEF.md))
- `apps/site`: the public ShubhJets website (see [WEBSITE.md](WEBSITE.md))
- UI/UX standards for both: [UX.md](UX.md)

## Start building with Claude Code

Open this repo in Claude Code and send:

```
Read BRIEF.md, UX.md and WEBSITE.md fully. Follow BRIEF.md: give me your plan, the data model and all your questions in one batch, then wait for my answers before writing code. Do not build the website until I ask.
```

## Repo layout

| Path | What it is |
|---|---|
| `apps/api` | NestJS API (TypeScript, ESM) |
| `apps/desk` | Internal desk app (Vue 3 + Vite + Tabler), mobile-first |
| `apps/site` | Public website: not built yet |
| `packages/shared` | Money (paise), IST dates, quote maths, numbering, shared by API and desk |
| `docs/DECISIONS.md` | Every product and build decision so far |

## Run it locally

Needs Node 22, pnpm 10 (`corepack enable`) and Docker (or your own PostgreSQL 16).

```bash
cp .env.example .env
pnpm install
pnpm infra:up       # PostgreSQL in Docker (skip if you run your own)
pnpm db:migrate     # create the tables, airports and default settings
pnpm seed           # fake demo data (wipes the development database)
pnpm dev            # API on :3000, desk on http://localhost:5173
```

Log in with the demo owner printed by `pnpm seed`: `owner@shubhjets.test` / `shubhjets dev passphrase`.

To try the first-login setup wizard instead, skip `pnpm seed` and set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
(at least 12 characters) in `.env`; the API creates that owner on a fresh database.

### Seed data

`pnpm seed` replaces all data with fake records only: Planner P1–P4, Hotel H1, Operator A–D
(A and B verified, C's insurance expiring in 9 days, D not yet verified), clients C1–C6 and weddings
W-101 to W-106, one in each status from enquiry to done, with legs, rate requests and replies, quotes,
payments and guests. Dates are relative to today.

**Seed data never reaches production.** Three guards make sure of it:

1. `pnpm seed` refuses to run when `NODE_ENV=production`, even with `--force`.
2. It also refuses on any database that has real (non-demo) accounts. Pass `--force` only for a throwaway development database.
3. Demo accounts all use the reserved `.test` email domain. In production the API rejects their logins, disables any it finds at startup and won't accept a `.test` `ADMIN_EMAIL`.

## Checks

```bash
pnpm check          # lint + format + typecheck + all tests (what CI runs, plus build)
pnpm test           # all tests
pnpm build
```

API tests run against a real PostgreSQL database named `shubhjets_test` (set `TEST_DATABASE_URL` to change it;
the name must end in `_test` because tests wipe it). With Docker: `docker compose exec postgres createdb -U shubhjets shubhjets_test`.

CI (GitHub Actions) runs everything on every push.

## Useful commands

| Command | What it does |
|---|---|
| `pnpm db:migrate` | Apply pending database migrations |
| `pnpm --filter @shubhjets/api db:revert` | Undo the last migration (development only) |
| `pnpm --filter @shubhjets/api gen:key` | Make a new `DATA_ENCRYPTION_KEYS` value |

## Importing your research (CSV)

Templates with the exact headers and one fake example row:
[`docs/templates/partners-template.csv`](docs/templates/partners-template.csv) and
[`docs/templates/operators-template.csv`](docs/templates/operators-template.csv) (also downloadable in the desk).

- **Partners:** `type` (planner, hotel or other) and `firm` are required. Phones can be 10-digit Indian mobiles
  or start with `+` and a country code.
- **Operators:** only `legal_name` is required. Cells with several values use `;` between items and `|` between parts:
  - `bases`: `DEL;UDR`
  - `aircraft`: `type|registration|category|seats`, e.g. `Citation XLS|VT-ZZ9|midsize|8;King Air B200||turboprop|7`
    (category: turboprop, light, midsize, super-midsize or heavy)
  - `contacts`: `name|phone|email`
- **Column names:** they don't have to match exactly. The import matches common alternatives (e.g. "Mobile" →
  phone), and you can change the match before importing.
- **Checking:** the preview flags problems line by line and finds duplicates (partners: same phone, email or website;
  operators: same NSOP number or website), both in your records and earlier in the same file.
- **Choices:** for each line you choose add, merge or skip.
  - Merge only fills empty fields and adds new bases, aircraft and contacts; it never overwrites.
  - The import is all or nothing.
  - Imported operators always start unverified; imported partners start as new leads with a "research import" consent record.
- **Limits:** 2 MB and 2,000 lines per file.

Exports (partners, weddings) are UTF-8 CSV that opens correctly in Excel. Cells that a spreadsheet could run as
formulas are escaped.

## File storage

Uploads (operator documents, logos, receipts, guest IDs) go through one storage layer with two drivers:

| `STORAGE_DRIVER` | Where files go | Use for |
|---|---|---|
| `local` (default) | `STORAGE_LOCAL_DIR` on disk (`.data/files`) | development and tests |
| `s3` | any S3-compatible private bucket | production (a Railway Storage Bucket) |

For the Railway bucket, set these on the API service, copied from the bucket's **Credentials** tab or wired with
Railway variable references:

| Variable | Railway bucket value |
|---|---|
| `S3_ENDPOINT` | the endpoint, e.g. `https://t3.storageapi.dev` |
| `S3_BUCKET` | the bucket name |
| `S3_REGION` | `auto` |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | the bucket's access key and secret |
| `S3_FORCE_PATH_STYLE` | `false` (Railway uses virtual-hosted URLs) |

The API refuses to start in production with `STORAGE_DRIVER=local`, because container disks are wiped on every deploy.
Files are private. The desk opens them through links that expire after 5 minutes: presigned bucket URLs for ordinary
files, and links served by the API for encrypted files (guest IDs). Every opening of an encrypted file is logged.

## Quote PDFs

Quotes are A5 PDFs made on the server with headless Chromium (Playwright), with the brand fonts embedded, so they
look the same everywhere. Locally and in CI the Chromium that Playwright installs is used:

```bash
pnpm --filter @shubhjets/api exec playwright-core install --with-deps chromium
```

In production either install it the same way in the API image, or point `PDF_CHROMIUM_PATH` at a system Chromium.

**Rule 4 check on every PDF.** Before a quote PDF is stored or previewed, its text is read back out of the PDF and
scanned for every internal figure behind it: each operator's net rate and leg share, our margins, markups,
commission and the operators' bank details, written as `₹4,75,000`, `475000`, `4.75 lakh`, `₹4.75L` or as a
percentage, plus the words "net rate", "margin", "markup" and "commission". If anything is found, the quote is not
issued and nothing is stored. Tests: `apps/api/test/quote-pdf.test.ts`.

## Sharing and email

Every document has one **Share** button. The app prepares the message and a **secure link**; you press send.

- Each share gets its own link (`/s/<random token>`), so you can see who opened it and when. Links expire after
  the number of days in Settings (default 14) and can be switched off at any time. Only a hash of the token is stored.
- The link page is a small branded page (no scripts, never indexed) with the PDF. Quotes also have **I accept**:
  the client types their name and ticks a box; the acceptance appears on the Quote tab for you to confirm.
- In development Vite forwards `/s/*` to the API. **In production the desk's host must forward `/s/*` to the API's
  `/api/s/*`** (a rewrite next to the `/api/*` one), and `PUBLIC_BASE_URL` is the desk's address.
- **Email from the app** uses [Resend](https://resend.com): set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a
  domain verified in Resend). The PDF is attached and the message carries the secure link. Until then, Email opens
  the phone's mail app with the message ready.

## Today screen

Open the app and **Today** shows, top to bottom: this month's **You keep** (after partner commission) against the
target, with **Margin** (before commission) beside it (change the target in Settings → Rules), then **Do now** with the most urgent things first, each with one button, then weddings by status,
the season so far, partner pipeline, lead sources and route coverage. Tap **Later** (or swipe a card left) to move
an action to tomorrow morning; Undo brings it back. Pull down to refresh.

## Website enquiries

The public website posts to three endpoints that need no login:

| Endpoint | What it does |
| --- | --- |
| `POST /api/public/enquiries` | Enquiry form → a new wedding in **Enquiry** with the client (or partner), consent, lead source, UTM and draft legs |
| `POST /api/public/partners` | "For planners & hotels" form → a partner to follow up today |
| `POST /api/public/events` | WhatsApp / call taps (`{"kind":"WHATSAPP","page":"/", "utmSource":…}`), counted per lead source |

- Set `SITE_ORIGINS` to the website's addresses (e.g. `https://shubhjets.com,https://www.shubhjets.com`).
  Only these may call the endpoints from a browser.
- Both forms need `consent: true`. Send an empty hidden `companyWebsite` field and `elapsedMs` (how long the form was
  open); filled hidden fields and forms sent in under 2.5 seconds are treated as spam but still get `{ ok: true }`.
- Enquiry fields: `name`, `phone`, `role` (`family` / `planner` / `hotel`), `firm` (planners and hotels), `email`,
  `weddingCity`, `weddingDate` (YYYY-MM-DD), `guests`, `guestsFrom` ("18 from Delhi, 6 from Mumbai"), `message`,
  plus `page`, `leadSource`, `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `gclid`.
- Errors come back as `{ message, fields: { field: "what to fix" } }` in plain words, ready to show under each input.
- A wedding from the website shows a **From the website** card on its Overview tab with what they typed.

## Keys you must back up

> **Back up `DATA_ENCRYPTION_KEYS` somewhere safe (for example a password manager), separately from the database backups.**
> Bank details and guest ID files are encrypted with it. If the key is lost, that data **cannot be recovered**, not even
> from a database backup. When rotating, put the new key first and keep the old ones in the list until everything has
> been re-encrypted.

Eval and deploy steps are added to this README as those steps are built.
