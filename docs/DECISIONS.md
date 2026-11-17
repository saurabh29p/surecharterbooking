# Decisions

Answers to the build questions (17 Nov 2026) and other choices made during the build. Newest at the bottom.

## Business profiles (replaces hard-coded business details)
- Nothing about the business is hard-coded. A **Business Profile** holds: brand name, legal entity name, LLPIN, GSTIN, state, registered address, bank details (encrypted), authorised signatory (name, designation), arbitration seat city, logo, invoice number prefix.
- First login opens a short setup wizard; every field is skippable and editable later in Settings.
- Several profiles are allowed (e.g. a Haryana GSTIN later); one is the default. Every wedding, quote, invoice and agreement records the profile it used. Invoice numbering runs per profile.
- Documents show a clear warning when GSTIN, LLPIN, signatory or bank details are empty. Invoices cannot be issued until GSTIN and address are filled.
- The first profile is Delhi (home state for GST).

## Tax and money
- GST rates and SAC codes are placeholders behind a warning banner until the CA confirms them.
- Operator net rates are entered ex-GST; cost = net; operator GST is tracked separately on the payout.
- Partner payouts show the gross amount, with an optional TDS % per payout.
- Required payment before confirmation defaults to 100%, editable per wedding; advance + balance schedules are allowed.
- Our bank details on quotes and invoices come from the business profile.
- Invoice numbers: `<PREFIX>/<FY>/<0001>`, e.g. `SJ/2026-27/0001`, per profile, resetting on 1 April.

## Operations
- Seed airports: DEL, BOM, BLR, HYD, MAA, CCU, AMD, PNQ, UDR, JAI, JDH, GOI, GOX, PGH, JSA, DED, COK, IXC.
- Cancellation terms: default text in Settings, editable per quote. The quote screen shows the chosen operator's cancellation conditions next to ours and warns if ours are looser.
- One leg can use several aircraft (several chosen rate responses whose seats cover the passengers).
- One rate response can cover several legs as a package price; the cost is split across legs proportionally for margin reporting.
- Today thresholds: chase an operator after **2 h** without a reply; warn 3 h before a quote expires; guest IDs due 5 days before the flight; partner follow-ups on the due date; guest ID files deleted 30 days after the wedding's last leg.

## Accounts and infrastructure
- Keys are requested only when a step needs them.
- Storage: Cloudflare R2. Email: Resend. PDFs: Playwright/Chromium HTML→PDF.
- Preview URLs (Vercel/Railway) until the domain is bought.
- Brand: a Bodoni Moda wordmark in champagne gold, replaced by the logo from the business profile when one is uploaded.
- Login lasts 30 days on a device (rotating refresh token), with a "log out all devices" button.
- Desk UI in English; AI accepts Hindi/Hinglish input (Phase B).
- pnpm + Node 22 + GitHub Actions CI.

## Build choices (step 1)
- **TypeScript 6.0** (the last JavaScript-based compiler; 7.x is the new native compiler, and Vue/Nest tooling support for it is not yet proven).
- **NestJS 12 is ESM-only**, so the API is an ES module compiled with `tsc` (NodeNext). `packages/shared` is compiled to `dist/` for the API at runtime; the desk and all tests read its TypeScript source directly through the `@shubhjets/source` export condition.
- **Vitest for every package**, including the API (with SWC for decorator metadata), instead of Jest — one test runner for the whole repo.
- Money is integer paise and percentages are integer basis points (10000 = 100%); all maths uses BigInt intermediates and rounds half away from zero.

## Build choices (step 2)
- **All API routes live under `/api`, and the desk calls them on its own site** (a Vite proxy in development, a Vercel rewrite in production). The refresh cookie is then first-party, so Safari and other browsers that block third-party cookies keep you logged in.
- **Sessions:** a 15-minute access token kept only in memory, plus a refresh token in an httpOnly, SameSite=Strict cookie (`/api/auth` only). Every refresh rotates the token and pushes expiry 30 days out. A token replayed after rotation ends that device's session (theft protection); a 30-second grace covers two tabs refreshing at once. "Log out all devices" also bumps a per-user version, so access tokens die immediately.
- **Login limits:** 10 attempts per 15 minutes per network, and an email is locked for 15 minutes after 8 wrong passwords. Both are in memory, which is fine for one API instance.
- **Business profiles are archived, never deleted**, because weddings, quotes and invoices keep pointing at the profile they used.
- **Reference data (airports, default settings) ships in a migration**, so production has it without running the fake seed.
- **Logo upload** waits for file storage (step 4); until then documents use the ShubhJets wordmark.
- **Seed data skips documents and shares** until PDFs and sharing exist (steps 8–11).
