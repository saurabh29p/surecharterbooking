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
- Storage: ~~Cloudflare R2~~ **Railway Storage Bucket** (S3-compatible; changed 17 Nov 2026), configured only through `S3_*` env variables. Email: Resend. PDFs: Playwright/Chromium HTML→PDF.
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

## Deploy reminders (raise these when we deploy)
- Store `DATA_ENCRYPTION_KEYS` in a safe backup (password manager), separate from database backups. Losing it makes encrypted bank details and guest ID files unrecoverable.
- Set real `ADMIN_EMAIL` / `ADMIN_PASSWORD` (not a `.test` address) and a fresh random `JWT_SECRET`.
- Never run `pnpm seed` against production. It refuses, but don't try.
- The API image needs Chromium for quote PDFs (`playwright-core install --with-deps chromium`, or `PDF_CHROMIUM_PATH`).

## Build choices (step 3)
- **The audit log is automatic.** Entities marked `@Audited` get a database subscriber that writes before/after values in the same transaction as the change, so nothing is forgotten and a rolled-back change leaves no entry. Changes must go through repository `save()`; bulk updates are logged as `BULK_UPDATED`. Non-change events (logins, viewing bank details, sharing) are logged explicitly.
- **Who did it** comes from a per-request context: you (after login), Website visitor (before login), System (scheduled jobs) or AI (Phase B jobs, via `runAs`). The AI can never act as you.
- **GST confirmation:** the GST rate and SAC code show a warning banner on every screen until you tick "My CA has confirmed" (a SAC code is required). Changing either value un-ticks it.
- **Settings are defined once** in `packages/shared` (labels, units, limits), so the API and the desk validate identically.

## Build choices (step 8)
- **Cancellation terms are a schedule**, not only text: lines like "7+ days before departure: 10% kept". That lets code
  compare ours with each operator's and say exactly where ours are looser ("3 to 7 days before departure: Operator A
  keeps 50% but your terms keep only 10%"). Issuing with looser terms needs a deliberate confirmation. Free text
  stays for extra conditions. Our default schedule is a setting (30+ days 10%, 7–30 days 50%, under 7 days 100%).
- **A draft follows the chosen jets.** One line per jet per leg (a package rate's cost is that leg's share); each jet
  keeps its markup (% or fixed) when jets change. Totals are always recomputed on the server with the shared maths.
- **Quote statuses:** Draft → Ready to send (issued: PDF made, frozen, validity running) → Sent → Accepted, or
  Expired / Replaced. A new version copies the last one; while it is drafted the quoted legs' jets can change again.
- **The quote PDF is A5 portrait, one column,** with the total and validity on top, so it reads well on a phone in
  WhatsApp and still prints cleanly. Bodoni Moda + Manrope, midnight and champagne gold. It names the operator and its
  DGCA permit number, never the registration number.
- **Rule 4, twice:** the PDF template only ever receives a client-safe quote object (no cost, margin, markup or
  commission fields), and the finished PDF's text is scanned for every internal figure before it is stored.
- **Fee-only invoicing warning:** with the fee-only model the GST amount lets a reader work out the margin
  (GST ÷ rate), so the quote screen warns about it. Full-value invoicing (the default) does not have this problem.

## Build choices (step 9)
- **Agreement templates are Markdown with `{{placeholders}}`**, versioned, with a "lawyer-approved on <date>" flag.
  Three drafts ship in Indian contract format; blanks for the lawyer are marked `[●]`. Any edit makes a new version
  that needs approval again; only the newest version can be approved.
- **Drafts can't be signed.** Until its template is approved, every agreement says "DRAFT – NOT FOR SIGNATURE" and the
  app refuses a signed copy. An approved agreement must be complete: missing details are listed and it isn't made.
- **Client terms are built from the accepted (or live) quote's client-safe content** and get the same rule-4 PDF scan
  as the quote. Signing an operator agreement also files it under the operator's documents; signing a referral
  agreement marks the partner as signed.
- **GST invoices:** full value only, from the accepted quote; numbered `PREFIX/FY/0001` per business profile and
  financial year under a database lock; never reused (mistakes are cancelled, with a reason). Blocked until the
  profile has GSTIN and address, the CA has confirmed GST rate and SAC code, and the client's billing address is known.
- **Rate request PDF** names the wedding by code and city only: never the client, partner or a price.

## Build choices (step 4)
- **Storage drivers:** `local` (development and tests) and `s3` (any S3-compatible bucket; Railway in production). Production refuses `local`.
- **Uploads are checked by their real bytes** (PDF, PNG, JPEG, WebP only; SVG refused because it can carry scripts), with a size limit per purpose. Each file is fingerprinted (SHA-256).
- **Guest ID files are encrypted by the app before upload**, so even the bucket never holds them in readable form. They are served only through the API, and every opening is logged.
- **Download links expire after 5 minutes.**
