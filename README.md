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

Needs Node 22, pnpm 10 (`corepack enable`) and Docker.

```bash
cp .env.example .env
pnpm install
pnpm dev            # starts Postgres (Docker), the API on :3000 and the desk on :5173
```

## Checks

```bash
pnpm test           # all unit tests (Vitest)
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
```

CI (GitHub Actions) runs all of these on every push.

Seed, eval and deploy steps are added to this README as those steps are built.
