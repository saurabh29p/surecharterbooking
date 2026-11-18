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
- Forward `/s/*` on the desk's host to the API's `/api/s/*` (secure share links) and set `PUBLIC_BASE_URL`.
- Email: create a Resend account, verify the sending domain, then set `RESEND_API_KEY` and `EMAIL_FROM`.
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

## Build choices (step 11)
- **One Share sheet for every document.** Each send makes its own secure link (random token; only its hash is
  stored), so you can see who opened what. Links expire after the days in Settings (14) and can be switched off.
- **The link page** is served by the API (no scripts, never indexed, no referrer, no framing, rate-limited) and shows
  only client-safe content and the stored, leak-scanned PDF. Production needs the desk host to forward `/s/*`.
- **"I accept" on a quote link records name, time and a hashed IP; it never accepts the quote by itself.** It shows on
  the Quote tab as "accepted on the link — Confirm acceptance". Links stop accepting when the quote expires or is
  replaced.
- **Email from the app** goes through Resend with the PDF attached and the secure link in the message, idempotent per
  share. Until it's set up, Email opens the phone's mail app.
- WhatsApp and Telegram get the message with the link pre-filled; Instagram and Messenger can't take pre-filled text,
  so the message is copied and the app opened.

## Build choices (step 10)
- **Confirming a wedding (rule 2)** is one action with a checklist: accepted quote, signed client terms (an
  uploaded signed copy of an approved, non-draft version) and client payments ≥ the wedding's required share
  (default 100%). Nothing else can set "Signed and paid".
- **Payouts (rule 3):** an operator payout (net + the operator's GST) or partner commission can be made payable or
  recorded as paid only when client money received covers it on top of everything already payable. Commission
  also waits until the wedding has flown (as the referral agreement says). TDS on commission is optional per payout.
- **Client payments** need an accepted quote and can't exceed the balance (typo guard). Payments are never deleted:
  "Remove" keeps them for the record and has Undo; removal is refused if payouts rely on the money or the wedding
  is confirmed with it.
- **Flights:** "Mark flown" per leg from its flight date; first leg → Flying, all legs → Done.
- **Guest IDs** are encrypted by the app, opened only through logged links, and deleted by a daily job (03:30 IST)
  N days after the last flight (Settings, default 30). "ID received" stays as a fact after the file is gone.

## Build choices (step 13)
- **Today is one API call** (`GET /api/today`) and is kept in memory while the app is open, so going back to it is
  instant while it refreshes. Nothing is stored on the phone. It refreshes on pull-down, the ↻ button, and when you
  come back to the app after 5 minutes.
- **The month tracker comes first** and shows margin (before partner commission) from the accepted quote of every
  wedding **confirmed** (signed and paid) this calendar month, against the target in Settings → Rules. The season is
  the Indian financial year.
- **Do now is made by code rules**, in three groups: **Now**, **Today**, **Coming up**. Within a group the order is
  fixed: a client waiting (link acceptance, new website enquiry, quote about to lapse) comes before flights to mark,
  guest IDs, confirming, operator expiry, chasing operators, payments, quotes to build or share, payouts,
  follow-ups, enquiries to price, commission and the business profile.
- **One button per action**: it opens the right tab, opens WhatsApp with a ready message (or calls), or does it in
  place ("Mark flown", with Undo). Messages to operators name the wedding by code and city only, never the client.
- **Later** hides an action until 7 am IST the next day (button or swipe left, with Undo). It is stored, so it holds
  on every device.
- Thresholds come from Settings: chase an operator after N hours (default 2), warn N hours before a quote expires,
  ask for guest IDs N days before the first flight. A new website enquiry stays "reply within the hour" for 48 hours
  or until rates are requested; operator expiry shows from 30 days (Now from 7 days).
- **Route coverage** counts aircraft of verified operators based at either end of each website route and of every
  route flying in the next 120 days (return flights count as the same route).

## Build choices (step 12)
- **Public endpoints** (no login, for shubhjets.com): `POST /api/public/enquiries` (enquiry form),
  `POST /api/public/partners` (planners and hotels sign-up), `POST /api/public/events` (WhatsApp and call taps,
  sent with `navigator.sendBeacon`). Only the origins in `SITE_ORIGINS` may call them from a browser, and without
  cookies; the desk's endpoints never answer the website's origin.
- **Consent is required** on both forms and recorded as "Website enquiry form" with the notice version.
- **Spam:** a hidden field and a "filled in under 2.5 seconds" check. Bots get the same "thank you" as people, so
  they learn nothing; their rows are kept (no wedding, no client) and counted as "spam caught". Each network may
  send 8 forms per 10 minutes. IP addresses are stored only as a salted hash.
- **A family enquiry** finds the client by WhatsApp number (or adds one); **a planner or hotel enquiry** finds the
  partner by phone or email (or adds one as "Contacted", follow-up today). Either way the wedding starts in
  "Enquiry" with venue city, date, notes, lead source and UTM. The wedding keeps the website lead source (Google Ads,
  Instagram or Website) even when a partner sends it, so ad spend can be judged; the partner is still linked.
- **Lead source:** a Google Ads click id or `google`/`cpc` → Google Ads; `instagram` → Instagram; otherwise Website.
- **Draft legs:** one leg per city the guests fly from, when both airports are clear ("Goa" alone is not), for the
  day before the wedding, marked "confirm on the call". Cities we don't serve are left in the notes.
- **The same enquiry sent twice within 24 hours** (same number, role, city and date) joins the first wedding.

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
