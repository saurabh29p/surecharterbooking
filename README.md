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

## Keys you must back up

> **Back up `DATA_ENCRYPTION_KEYS` somewhere safe (for example a password manager), separately from the database backups.**
> Bank details and guest ID files are encrypted with it. If the key is lost, that data **cannot be recovered**, not even
> from a database backup. When rotating, put the new key first and keep the old ones in the list until everything has
> been re-encrypted.

Eval and deploy steps are added to this README as those steps are built.
