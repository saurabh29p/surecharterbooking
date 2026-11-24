# BRIEF — Vaanika Wedding Charter Desk (internal system)

Prompt for Claude Code. Build a small, fast, mobile-first internal tool for ONE niche:
**private jet flights for Indian destination weddings, sold through wedding planners.**
If a feature does not help close a wedding deal, do not build it.

The public website is a separate app in the same repo: see `WEBSITE.md`.
**UI/UX quality is a hard requirement:** follow `UX.md` for every screen and component.

---

## 0. How you must work
1. Read this file, `UX.md` and `WEBSITE.md` fully.
2. Reply with: (a) a short build plan, (b) the data model, (c) ALL your questions in ONE batch. Then STOP and wait for my answers.
3. Build in two phases, small working commits, tests passing at every step:
   - **Phase A (first 2 weeks):** login, data model, imports, weddings + legs, rate comparison, quote PDF, agreements, payments, hard rules, sharing, Today screen.
   - **Phase B:** AI gateway + the 3 AI jobs + assistant panel.
   - Build the public website (`WEBSITE.md`) only when I say so.
4. After each step, tell me in plain language what works, what doesn't, and what you need from me.

## 1. Business context
- Brand: **Vaanika** ("Vaanika is a brand of Indicgems Exim LLP.", India), domain `flyvaanika.com`. Keep the brand name in one config value. Internal code names (`@shubhjets/*`, the Railway project, database names) stay as they are.
- We are a **charter broker**: we do NOT own or operate aircraft. We get rates from licensed operators, add our margin (default 10%), and arrange the flights.
- Operators must hold a DGCA **Non-Scheduled Operator Permit (NSOP)**. DGCA requires operators to publish aircraft age, maintenance history and pilot experience on their websites, and publishes NSOP safety rankings.
- Niche: destination weddings, peak season November–March.
- Routes: Delhi / Mumbai (and other metros) → Udaipur, Jaipur, Jodhpur, Goa, Jim Corbett (Pantnagar), and returns.
- Channels: wedding planners (main), luxury hotel wedding teams, my personal network, and the website (Google, Instagram).
- One wedding = usually 2–6 flight legs.
- Partners earn a referral commission, by default a **share of my margin** (20%), configurable per partner (or % of booking value).
- Research (finding planners and operators) is done OUTSIDE this app, in Claude chat, and imported as CSV. No web scraping or web search inside the app.
- One user (me), mostly on my phone. Design so a second user can be added later.
- Keep this project fully separate from my other product (PitchPersona): own database and API keys.

## 2. One wedding, end to end
1. A planner messages me on WhatsApp, e.g. "12 Dec ko Udaipur, 18 log Delhi se, 6 Mumbai se, return 14th". I paste it in (or it arrives from the website form).
2. AI creates the Wedding with its Legs, lists missing details, and drafts a reply asking for them.
3. The app ranks **verified** operators for each leg; AI drafts a rate request to each. I send them myself.
4. I paste operator replies; AI extracts aircraft, price and conditions into a side-by-side comparison.
5. I choose; the app builds a branded multi-leg quote PDF (my margin + GST, operator named, no operator cost shown) and AI drafts the message. I share it.
6. Planner/client agrees; the app generates client terms + partner referral agreement and blocks confirmation until terms are signed and payment is received.
7. Before flight day it tracks guest names/IDs and drafts reminders.
8. After the flight it shows the operator payout and partner commission, payable only from client money received.
Every morning the **Today** screen tells me exactly what to do next.

## 3. Stack and repo layout
- Monorepo: `apps/desk` (this internal app, Vue 3 + TypeScript + Vite + Tabler UI), `apps/api` (NestJS + TypeScript + TypeORM + PostgreSQL), `apps/site` (public website, see `WEBSITE.md`), `packages/shared` (types, money/format utils).
- Jobs: pg-boss (Postgres queue) for alerts, reminders and AI jobs.
- Files: private S3-compatible storage, signed URLs only. PDFs generated on the server.
- Email: a transactional email service (e.g. Resend or Amazon SES) from my business address.
- AI: **OpenRouter** only, through our own AI gateway (section 6).
- Deploy: API + Postgres on Railway; `apps/desk` and `apps/site` on Vercel.
- One command to run everything locally. `.env.example` with every variable. Never commit secrets. README with setup, run, test, seed, eval and deploy steps.

## 4. Data model
- **Partner**: type (`PLANNER`, `HOTEL`, `OTHER`), firm, city, contact person, phone, email, website, Instagram, source link, status (`IMPORTED → CONTACTED → CALL_DONE → ACTIVE → INACTIVE`), commission basis (`MARGIN_SHARE` default 20% | `BOOKING_PERCENT`), referral agreement signed (y/n + file), next follow-up date, notes, activity log (called / no answer / sent deck / call booked / met). Computed: weddings this season, bookings value, commission owed.
- **Client**: name, contact, linked partner (if any), consent record.
- **Wedding**: code (W-101…), partner, client, venue city, wedding dates, lead source (`PARTNER`, `NETWORK`, `HOTEL`, `WEBSITE`, `GOOGLE_ADS`, `INSTAGRAM`, `OTHER` + UTM fields), status (`ENQUIRY → RATES_REQUESTED → QUOTED → SIGNED_AND_PAID → FLYING → DONE`, or `LOST` + reason), notes. Computed: total sell, total cost, margin ₹ and %, commission.
- **Leg**: wedding, from, to, date, time window, passengers, aircraft category (turboprop / light / midsize / super-midsize / heavy, or helicopter single / twin engine), status, chosen operator + aircraft, net rate, sell price. Helicopter legs also have: a venue or helipad at either end (name, city, map link; the airport stays as the nearest reference), the service (transfer, bride/groom entry, flower shower, guest joyrides) and a permissions checklist (see 5.9).
- **RateResponse**: leg, operator, aircraft, net rate, inclusions/exclusions, validity, received at, raw text. Helicopter replies may be priced per flying hour: rate per hour, flying time, positioning and waiting charges; the net rate is worked out from them.
- **Operator**: legal name, brand, CIN, GSTIN, NSOP permit no. + issue/expiry, insurance expiry, bases, website, safety-disclosure URL, DGCA safety rank (+ checked date + source), contacts, bank details (encrypted), status (`FOUND → VERIFIED`, `EXPIRING_SOON` ≤30 days, `BLOCKED`), notes. Computed: average reply time, average price vs others, weddings done.
- **Aircraft**: operator, type, registration, category, seats, year, base.
- **OperatorDocument**: NSOP permit, insurance, signed operator agreement — file, expiry, "verified by me on <date>".
- **Guest** (per leg): name, phone, ID received (y/n), ID file (encrypted, auto-deleted N days after the wedding).
- **Payment**: client payment in / operator payout out / partner commission out; amount, date, mode (default bank transfer), reference, receipt file.
- **Document**: type (quote, client terms, operator agreement, referral agreement, invoice, rate request), version, linked records, status (draft / shared / signed), files.
- **Share**: document version, channel, recipient, time, secure-link token, opened at.
- **Task**, **AuditLog**, **AiCall**, **Settings**.

## 5. Core features (normal code, no AI)

### 5.1 Login
Email + password (argon2), rate-limited; admin seeded from env; session/JWT with refresh.

### 5.2 Hard rules (enforced in the API, each one tested)
1. Only `VERIFIED` operators (permit + insurance verified by me, not expired, not blocked) can be chosen for a leg or quote.
2. A wedding moves to `SIGNED_AND_PAID` only when client terms are signed AND required payment (default 100%, editable per wedding) is recorded AND every helicopter leg's permissions checklist is complete.
3. Operator payouts and partner commission can be marked payable only after enough client money is received.
4. Anything shared with a partner or client never contains operator net rates, operator bank details or my margin. Enforce in the PDF and share layer; test it.
5. GST rates and SAC codes are settings (my CA sets them); warning banner until confirmed. Invoicing model (full-value invoice vs fee-only invoice) is a setting too, default full value; never hard-code tax.
6. Money stored as integer paise; Indian format (₹1,23,45,678 and ₹24.0L / ₹1.2Cr); timezone Asia/Kolkata.
7. Audit log for every change to weddings, legs, operators, partners, payments, documents, shares and every AI action.
8. Daily job: operator permit/insurance expiry alerts at 30 and 7 days; auto-block on expiry.

### 5.3 Imports and exports (CSV)
- **Partner CSV**: type, firm, city, contact person, phone, email, website, Instagram, source link, fit note.
- **Operator CSV**: legal name, brand, NSOP permit no., bases, aircraft (type, registration, category, seats), contacts, website, safety-disclosure URL, source link.
- Flow: upload → preview with column mapping → duplicates shown (same phone/email/website, or same NSOP no./CIN) → I choose skip/merge/add → import. Imported operators start as `FOUND`.
- Export partners and weddings as CSV.

### 5.4 Screens (mobile-first)
1. **Today (home)**
   - **Do now**: actions generated by code rules, each with one button (e.g. "W-104: 2 of 4 rates in — chase Operator B", "Quote for W-107 expires in 3 h", "Call Planner P3 — follow-up due", "W-101 flies in 5 days — 6 guest IDs missing", "Operator C insurance expires in 9 days").
   - Season tracker: margin this month vs target (editable, default ₹20,00,000), weddings confirmed, average margin per wedding.
   - Weddings board by status (card: code, partner, city, date, legs, value, margin).
   - Partner pipeline counts by status.
   - Route coverage: verified jets per route (e.g. DEL→UDR: 4 midsize, 1 heavy).
   - Lead sources this season: enquiries, quotes, bookings and margin per source.
2. **Wedding page**: legs table; rate comparison per leg; quote builder (markup % or fixed per leg, extras with cost/sell, GST from settings, totals, margin, commission); guest manifest; money (paid / due / payouts / commission); documents and share history.
3. **Partners**: list, pipeline, follow-ups due, quick activity buttons, commission owed.
4. **Operators**: list filterable by route/category/status; verification checklist; documents; expiry alerts.
5. **Settings**: brand, GST and invoicing model, target, default markup, default commission, quote validity, ID retention days, secure-link expiry, approved AI providers, AI cap, AI models per job.

### 5.5 Documents (PDF, branded Vaanika)
- **Multi-leg wedding quote**: all legs, aircraft, named operator, per-leg and total price, GST, validity (default 24 h), cancellation terms.
- **GST invoice**.
- **Rate request** to operator (route, date, passengers, category, timings).
- **Agreement templates** stored as Markdown with `{{placeholders}}`, editable, versioned, with a `lawyer_approved` flag + date. Until approved, output carries the watermark "DRAFT – NOT FOR SIGNATURE". Seed 3 DRAFT templates in real Indian contract format (title; place and date; parties block with LLPIN/GSTIN and CIN/NSOP no.; recitals; definitions; numbered clauses; annexures; signature blocks; e-stamp and e-sign execution note):
  1. **Operator–Broker Agreement**: broker is not the carrier; operator keeps operational control and pilot-in-command authority; operator warranties (valid NSOP, airworthiness, insurance, qualified crew, notify on suspension); net rates; payment terms; cancellation schedule (Annex A); liability, indemnity, insurance minimums; non-circumvention (24 months); confidentiality and DPDP Act 2023; force majeure; termination (immediate if NSOP suspended); Indian law; arbitration under the Arbitration and Conciliation Act 1996, seat [CITY].
  2. **Client Charter Terms + Booking Confirmation**: itinerary per leg, aircraft, named operator, price and inclusions, payment schedule, cancellation and changes (must match operator terms), passenger obligations and IDs, baggage, delays and pilot-in-command authority, broker's limited role, liability, disputes.
  3. **Partner Referral Agreement**: commission basis (share of margin or % of booking), earned only after the client has paid and flown, payout timing, partner cannot bind us, we never bypass the partner with their client, confidentiality, term.
- Signing for now: mark shared/signed and upload the signed copy.

### 5.6 Share anything
Every document and draft message has one **Share** button, for partners, clients and operators. The app prepares; **I always press send myself**.
- **Phone (main way):** Web Share API (`navigator.share`) with the PDF file + message text, so the phone's share sheet opens and I pick WhatsApp, WhatsApp Business, Instagram, Facebook Messenger, Telegram, Gmail or any app.
- **Direct buttons:** WhatsApp (`https://wa.me/<number>?text=<message + secure link>`), Telegram (`https://t.me/share/url?url=<secure link>&text=<message>`), Email (sent from the app with the PDF attached; `mailto:` fallback). Instagram DM and Facebook Messenger don't accept pre-filled text from a website, so show **Copy message + link** plus **Open Instagram / Open Messenger**. **Copy link** and **Download PDF** always available.
- **Secure links:** random token, expire after N days (default 14), revocable. The page shows the PDF; for quotes, an "I accept" button records name + time (I still confirm in the app).
- **Log every share** on the record (version, channel, recipient, time, opened).
- WhatsApp Business API (automatic sending) is for later.

### 5.7 Website enquiries
`apps/site` posts enquiries to a public API endpoint (rate-limited, honeypot, DPDP consent required) with lead source and UTM fields. Each enquiry lands on Today as a new wedding draft.

### 5.8 Data protection (DPDP Act 2023 / Rules 2025)
Consent record for every partner/client contact (notice version, time, source); guest ID files encrypted, access-logged, auto-deleted; export/delete a person's data (logged).

### 5.9 Helicopters for weddings
- **Categories:** helicopter (single engine) and helicopter (twin engine), next to the jet categories. A helicopter leg is only matched with helicopters, and a jet leg only with jets. Same rules as jets: only verified NSOP operators (rule 1), nothing internal on anything shared (rule 4).
- **Where it lands:** either end of a helicopter leg can be a venue or helipad (name, city, map link) instead of the airport. The nearest airport is still recorded for the operator. Arrival may equal departure when a venue is named (e.g. Udaipur airport → palace helipad, or a joyride from the venue lawn).
- **Services:** helicopter transfer, bride/groom helicopter entry, flower shower by helicopter, guest joyrides. The service name is shown on the quote, share page and invoice.
- **Rates:** operators usually price per flying hour plus positioning (ferrying to the start and back) and waiting on the ground. The reply can be entered that way; the net rate = rate × flying time + positioning + waiting. The comparison shows the breakdown to me only. **The client sees one price per service**; the hourly rate, flying time, positioning and waiting are scanned for and blocked like every other internal figure.
- **Rate request:** names the venue or helipad, the map link and nearest airport, and asks for the hourly rate, flying time, positioning and waiting, and whether the operator will check the landing site and help with local permissions.
- **Permissions checklist** per helicopter leg: landing site confirmed with the operator; local permission in hand (district administration / police / venue); flower-shower approval (only for a flower shower); weather backup plan agreed. Each tick is saved and audited. Until a leg's list is complete it stays on **Today** (more urgent as the flight nears: within 7 days "Now", within 30 days "Today") and the wedding **cannot be confirmed**.

## 6. AI (Phase B, OpenRouter)

### 6.1 Boundaries
- **AI only:** reads messy text into structured data, writes drafts, answers questions about my data. No web search inside the app.
- **Code only:** all maths (margin, GST, totals, commission), every rule in 5.2, rankings, PDFs, storage, reminders, dashboard numbers.
- **AI never:** marks an operator verified, sends any message, signs or shares documents, confirms weddings, records or moves money, deletes data. All AI output is a **draft** with Approve / Edit / Reject.
- Never send to AI: guest ID files, bank details, signed contracts, passwords. Send only the current wedding/leg/message, never whole histories.

### 6.2 AI gateway
- One NestJS module for all AI calls. Each job has a DB config: model, fallback, escalation, temperature (0–0.2), max tokens, JSON schema.
- Structured outputs (`response_format: { type: "json_schema", strict: true }`) + OpenRouter `response-healing` plugin; validate again with Zod; on failure retry once → fallback → escalation → "needs review".
- Route only to providers that support strict structured outputs and are in my approved-provider list (Settings).
- Prompt caching for the fixed instructions. Keep every prompt well under 100,000 tokens.
- Log every call in `AiCall` (job, model, tokens, cost, latency, linked record, output). Cost page in Settings. **Monthly cap ₹2,000**: warn at 80%, stop AI jobs at 100% (core app keeps working).
- **Evaluation harness:** per job, a golden set of 30 examples (input + correct output) and a command that scores any model on field-level accuracy, cost and speed. Seed starter sets from fake data; I'll add real ones. Switch models only when the harness shows a better score.

### 6.3 The 3 jobs
1. **Paste-to-wedding**: pasted WhatsApp/email text (English, Hindi or Hinglish) → Wedding + Legs draft, missing details, short draft reply.
2. **Rate requests**: for each leg, code ranks VERIFIED operators (category, seats, base vs departure, reply speed, past prices); AI writes a one-line reason each and drafts one rate request per chosen operator (WhatsApp + email versions). Pasted operator reply → AI extracts aircraft, net rate, inclusions/exclusions, validity into a `RateResponse`.
3. **Drafts**: quote message, follow-ups when there's no reply after X hours, partner follow-ups, guest-ID reminders, payment reminders.

### 6.4 Assistant panel
On every screen: runs jobs 1–3 and answers questions about my data with read-only tools (search weddings, legs, operators, partners, payments). Cites linked records, says "not found" instead of guessing, never invents prices, permit numbers or availability, opens pre-filled forms instead of saving anything itself.

### 6.5 Models (editable in Settings; verify exact OpenRouter IDs at build time)
| Job | Default | Fallback (different lab) | Escalation |
|---|---|---|---|
| Jobs 1–3 + assistant | Claude Haiku 5.5 | GPT-6 Luna | Claude Sonnet 5.5, only after two failed validations |

Expected running cost: a few hundred rupees per month in season.

## 7. Not now (design the data model so these fit later)
Corporate / family-office clients, international trips, empty-legs board, client portal, e-sign API, WhatsApp Business API, payment links, charter marketplace APIs, contract-risk analysis, news monitoring, in-app research/scraping.

## 8. Seed data and tests
- Fake data only: "Planner P1–P4", "Hotel H1", "Operator A–D", weddings "W-101–W-106" in different statuses with legs, rates, payments and shares. Never real company names or real NSOP numbers.
- Settings seed: brand Vaanika, markup 10%, commission 20% of margin, quote validity 24 h, target ₹20,00,000/month, GST placeholders (flagged), ID retention 30 days, secure-link expiry 14 days, AI cap ₹2,000.
- Tests: every hard rule in 5.2 (including rule 4 on shared documents); every AI prohibition; money formatting; margin/GST/commission maths; CSV import and duplicates; share links (expiry, revoke); AI gateway validation, retry, fallback and escalation; the full flow enquiry → rates → quote → signed & paid → flying → done.

## 9. Definition of done
- [ ] On my phone, Today shows exactly what to do next.
- [ ] I can import partners and operators from CSV with duplicate checks; operators stay `FOUND` until I verify them.
- [ ] I can create a wedding with legs, compare operator rates and share a multi-leg quote PDF within 15 minutes.
- [ ] Unverified or expired operators cannot be quoted (API + UI).
- [ ] A wedding cannot be confirmed before signed terms + payment; payouts and commission are blocked until client money arrives.
- [ ] Nothing shared with a partner or client shows operator rates or my margin.
- [ ] I can share any quote, agreement, invoice or rate request via WhatsApp, Instagram, Facebook, Telegram or email, and every share is logged.
- [ ] All 3 agreements generate as PDF with data filled in, watermarked until lawyer-approved.
- [ ] (Phase B) Paste a planner's WhatsApp message → wedding with legs, missing details and a draft reply; one tap drafts rate requests; pasted replies fill the comparison.
- [ ] (Phase B) AI cost page and ₹2,000 cap work.
- [ ] Every screen passes the `UX.md` quality checklist (alive buttons, instant feedback, skeletons, toasts with undo, mobile-first).
- [ ] All tests pass; deploys to Railway + Vercel following the README.

Start now: plan, data model and all your questions in one batch.
