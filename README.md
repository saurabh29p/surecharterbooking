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

## Keys you must back up

> **Back up `DATA_ENCRYPTION_KEYS` somewhere safe (for example a password manager), separately from the database backups.**
> Bank details and guest ID files are encrypted with it. If the key is lost, that data **cannot be recovered**, not even
> from a database backup. When rotating, put the new key first and keep the old ones in the list until everything has
> been re-encrypted.

Eval and deploy steps are added to this README as those steps are built.
