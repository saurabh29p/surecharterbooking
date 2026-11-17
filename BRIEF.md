# PROMPT FOR CLAUDE CODE — Wedding Charter Desk (v4)

You are building **Wedding Charter Desk**: a small, fast, mobile-first internal tool for ONE niche —
**private jet flights for Indian destination weddings, sold through wedding planners.**
If a feature does not help close a wedding deal, do not build it.

---

## 0. How you must work
1. Read this whole prompt first.
2. Reply with: (a) a short build plan, (b) the data model, (c) ALL your questions in ONE batch. Then STOP and wait for my answers.
3. After my answers, build in this order: Core (section 4) → AI gateway (5.1) → AI jobs (5.2–5.6) → Today screen polish.
4. Small, working commits. Each step must run and pass its tests before the next one.
5. At the end of each step, tell me in plain language what works, what doesn't, and what you need from me.

---

## 1. Business context
- Company: **Indicgems Exim LLP** (India). We are a **jet charter broker**: we do NOT own or operate aircraft. We get rates from licensed operators, add our margin (~8–15%), and arrange the flights.
- Operators must hold a DGCA **Non-Scheduled Operator Permit (NSOP)**. DGCA requires operators to publish aircraft age, maintenance history and pilot experience on their websites, and publishes NSOP safety rankings.
- Niche: destination weddings, peak season November–March.
- Routes: Delhi / Mumbai (and other metros) → Udaipur, Jaipur, Jodhpur, Goa, Jim Corbett (Pantnagar), and returns.
- Channel: wedding planners send us weddings and earn a referral commission (2–3%).
- One wedding = usually 3–6 flight legs (VIPs, family, guests, returns).
- Goal: ₹20 lakh margin per month in season (~8 weddings at ~₹24L bookings each).
- One user (me), mostly on my phone. Design so a second user can be added later.
- Keep this project fully separate from my other product (PitchPersona): own repo, database and API keys.

## 2. What the system does (one wedding, end to end)
1. A planner sends me a WhatsApp message, e.g. "12 Dec ko Udaipur, 18 log Delhi se, 6 Mumbai se, return 14th". I paste it in.
2. AI creates the Wedding with its Legs and lists missing details, with a draft reply asking for them.
3. AI ranks the best **verified** operators for each leg and drafts a rate request to each. I send them myself.
4. I paste operator replies; AI extracts aircraft, price and conditions into a side-by-side comparison.
5. I choose; the system builds a branded multi-leg quote PDF (my margin + GST) and AI drafts the message to the planner.
6. Planner agrees; the system generates client terms + planner referral agreement. It blocks confirmation until terms are signed and payment is recorded.
7. Before flight day it tracks guest names/IDs and drafts reminders.
8. After the flight it shows operator payout and planner commission — payable only from client money received.
Every morning the **Today** screen tells me exactly what to do next.

## 3. Stack
- Web: Vue 3 + TypeScript + Vite + Tabler UI. Mobile-first.
- API: NestJS + TypeScript + TypeORM + PostgreSQL.
- Jobs: pg-boss (Postgres queue) for alerts, AI jobs, monthly re-checks.
- Files: private S3-compatible storage, signed URLs only.
- PDFs generated on the server.
- AI: **OpenRouter** only, through our own AI gateway (5.1).
- Deploy: API + Postgres on Railway; web on Vercel.
- Monorepo: `apps/web`, `apps/api`, `packages/shared`. One command to run locally. `.env.example` with every variable. Never commit secrets. README with setup, run, test, seed, eval and deploy steps.

## 4. Core (normal code — no AI)

### 4.1 Login
Email + password (argon2), rate-limited; admin seeded from env; session/JWT with refresh.

### 4.2 Data model
- **Planner**: firm, city, contact person, phone, email, website, source link, status (`TARGET → CONTACTED → CALL_DONE → ACTIVE → INACTIVE`), commission %, referral agreement signed (y/n + file), next follow-up date, notes. Computed: weddings this season, bookings value, commission owed.
- **Wedding**: code (W-101…), planner, client family/contact, venue city, wedding dates, status (`ENQUIRY → RATES_REQUESTED → QUOTED → SIGNED_AND_PAID → FLYING → DONE`, or `LOST` + reason), notes. Computed: total sell, total cost, margin ₹ and %.
- **Leg** (many per wedding): from, to, date, time window, passengers, aircraft category (turboprop / light / midsize / super-midsize / heavy), status, chosen operator + aircraft, net rate, sell price.
- **RateResponse**: leg, operator, aircraft, net rate, inclusions/exclusions, validity, received at, raw text.
- **Operator**: legal name, brand, CIN, GSTIN, NSOP permit no. + issue/expiry, insurance expiry, bases, website, safety-disclosure URL, DGCA safety rank (+ checked date + source), contacts, bank details (encrypted), status (`FOUND → VERIFIED`, `EXPIRING_SOON` ≤30 days, `BLOCKED`), notes. Computed: average reply time, average price vs others, weddings done.
- **Aircraft**: operator, type, registration, category, seats, year, base.
- **OperatorDocument**: NSOP permit, insurance, signed operator agreement — file, expiry, "verified by me on <date>".
- **Guest** (per leg): name, phone, ID received (y/n), ID file (encrypted, auto-deleted N days after the wedding — setting).
- **Payment**: client payment in / operator payout out / planner commission out; amount, date, mode, reference, receipt file.
- **Agreement**: template, linked wedding/operator/planner, version, status (draft / sent / signed), files.
- **Task**: title, due, linked record, done.
- **AuditLog**, **AiCall** (see 5.1), **Settings**.

### 4.3 Hard rules (enforced in the API, each one tested)
1. Only `VERIFIED` operators (permit + insurance verified by me, not expired, not blocked) can be selected for a leg or a quote.
2. A wedding moves to `SIGNED_AND_PAID` only when client terms are marked signed AND required payment (default 100%, editable per wedding) is recorded.
3. Operator payouts and planner commission can be marked payable only after enough client money is received.
4. GST rates and SAC codes are settings (my CA will set them); warning banner until confirmed. Never hard-code tax.
5. Money stored as integer paise; Indian format (₹1,23,45,678 and ₹24.0L / ₹1.2Cr); timezone Asia/Kolkata.
6. Audit log for every change to weddings, legs, operators, payments, agreements, and every AI action.
7. Daily job: operator permit/insurance expiry alerts at 30 and 7 days; auto-block on expiry.

### 4.4 Screens (mobile-first)
1. **Today (home)**
   - Actions list (from 5.6), each with one button.
   - Season tracker: margin this month vs ₹20L target (editable), weddings confirmed, average margin per wedding.
   - Weddings board by status (card: code, planner, city, date, legs, value, margin).
   - Planner pipeline counts by status.
   - Route coverage: verified jets per route (e.g. DEL→UDR: 4 midsize, 1 heavy).
2. **Wedding page**: legs table; rate comparison per leg; quote builder (markup % or fixed per leg, extras with cost/sell, GST from settings, totals, margin); guest manifest progress; money (paid / due / payouts / commission); documents.
3. **Planners**: list, pipeline, commission owed, follow-ups due.
4. **Operators**: list filterable by route/category/status; verification checklist; documents; expiry alerts.
5. **Settings**: GST, target, default markup, quote validity, ID retention days, AI monthly cap, AI models per job.

### 4.5 Documents (PDF)
- **Multi-leg wedding quote**: all legs, aircraft, **named operator**, per-leg and total price, GST, validity (default 24 h), cancellation terms.
- **GST invoice.**
- **Agreement templates** stored as Markdown with `{{placeholders}}`, editable, versioned, with a `lawyer_approved` flag + date. Until approved, output carries the watermark "DRAFT – NOT FOR SIGNATURE". Seed 3 DRAFT templates in real Indian contract format (title; place and date; parties block with LLPIN/GSTIN and CIN/NSOP no.; recitals; definitions; numbered clauses; annexures; signature blocks; e-stamp and e-sign execution note):
  1. **Operator–Broker Agreement**: broker is not the carrier; operator keeps operational control and pilot-in-command authority; operator warranties (valid NSOP, airworthiness, insurance, qualified crew, notify on suspension); net rates; payment terms; cancellation schedule (Annex A); liability, indemnity, insurance minimums; non-circumvention (24 months); confidentiality and DPDP Act 2023; force majeure; termination (immediate if NSOP suspended); Indian law; arbitration under the Arbitration and Conciliation Act 1996, seat [CITY].
  2. **Client Charter Terms + Booking Confirmation**: itinerary per leg, aircraft, named operator, price and inclusions, payment schedule, cancellation and changes (must match operator terms), passenger obligations and IDs, baggage, delays and pilot-in-command authority, broker's limited role, liability, disputes.
  3. **Planner Referral Agreement**: commission basis, earned only after the client has paid and flown, payout timing, planner cannot bind us, confidentiality, term.
- Signing for now: mark sent/signed and upload the signed copy.

### 4.6 Data protection (DPDP Act 2023 / Rules 2025)
Consent record for every planner/client contact (notice version, time, source); guest ID files encrypted, access-logged, auto-deleted; export/delete a person's data (logged).

## 5. AI (OpenRouter)

### What AI does vs what code does
- **AI only:** reads messy text into structured data, writes drafts, searches the public web, answers questions about my data, double-checks critical fields.
- **Code only:** all maths (margin, GST, totals, commission), all rules in 4.3, PDFs, storage, reminders, dashboard numbers.
- **AI never:** marks an operator verified, sends any message, signs or sends agreements, confirms weddings, records or moves money, deletes data. All AI output is a **draft** with Approve / Edit / Reject. Only my click changes real records.
- Never send to AI: guest ID files, bank details, signed contracts, passwords.

### 5.1 AI gateway (build first)
- One NestJS module for all AI calls. Each job has a DB config: model, fallback model, temperature (0–0.2 for extraction), max tokens, JSON schema.
- Use OpenRouter structured outputs (`response_format: { type: "json_schema", strict: true }`) for every extraction, plus the `response-healing` plugin. Validate again with Zod; on failure retry once → fallback model → mark "needs review".
- Check per provider that strict structured outputs are supported; route only to those providers.
- Use OpenRouter's `web` plugin only for jobs 5.4 and 5.5.
- Use prompt caching for long, repeated instructions.
- Log every call in `AiCall`: job, model, tokens, cost, latency, linked record, output. Cost page in Settings.
- **Monthly cap: ₹10,000** (setting). At 80% warn me; at 100% stop AI jobs (core app keeps working).
- **Evaluation harness:** per job, a "golden set" of 30 examples (input + correct output) and a command that scores any model on field-level accuracy, cost and speed. Seed starter sets from fake data; I will add real ones. Switch models only when the harness shows a better score.

### 5.2 Job 1 — Paste-to-wedding
Input: pasted WhatsApp/email text (English, Hindi or Hinglish). Output: Wedding + Legs draft, list of missing details, and a short draft reply asking for them. I review and save.

### 5.3 Job 2 — Rate requests and reply reading
- For each leg, rank VERIFIED operators that can serve it (category, seats, base vs departure city, reply speed, past prices) with a one-line reason each. Ranking factors are computed by code; AI only writes the reasons and drafts.
- Draft one rate-request message per chosen operator (WhatsApp text + email version). I send them myself.
- I paste an operator's reply → AI extracts aircraft, net rate, inclusions/exclusions, validity into a `RateResponse`.

### 5.4 Job 3 — Drafts
Quote message to the planner, follow-ups when there's no reply after X hours (setting), guest-ID reminders before flight day, payment reminders.

### 5.5 Job 4 — Supply finder
- Find NSOP operators with jets that can serve the wedding routes, from public sources only: DGCA pages and notices, operators' own websites (including their safety-disclosure pages). Respect robots.txt and site terms; no logins; no LinkedIn.
- Save each fetched page (text, URL, date). Extract a profile; every field stores source URL, snippet, date, model, confidence.
- **Cross-check:** NSOP permit number, aircraft registrations and company name are extracted again by a second model; if they disagree or confidence is low → "needs review". Never fill these from one model alone.
- Status stays `FOUND` until I upload and verify documents.
- Monthly re-check of each operator's website; show me a field-by-field diff of changes.
- Detect duplicates (same NSOP no. / CIN / website) and merge only with my approval.

### 5.6 Job 5 — Planner finder
- Find wedding planner firms in Udaipur, Jaipur, Jodhpur, Goa, Delhi, Mumbai from public business sources: firm name, website, city, public business contact, what they do, fit reason, source link, personalised first-message draft.
- I approve each one. Export approved planners as CSV for PitchPersona.
- No private individuals' data, no bought lists, no bulk WhatsApp.

### 5.7 Today actions + assistant
- **Actions** are generated by code rules (quote expiring, rates missing, IDs missing, follow-up due, expiry soon); AI only writes the one-line wording and the draft behind each button.
- **Assistant panel** on every screen: runs jobs 1–5 and answers questions about my data using read-only tools (search weddings, legs, operators, planners, payments). It must cite linked records, say "not found" instead of guessing, never invent prices, permit numbers or availability, and open pre-filled forms instead of saving anything itself.

### 5.8 Default models (via OpenRouter, editable in Settings)
| Job | Model | Cross-check / fallback |
|---|---|---|
| All jobs + assistant | Claude Sonnet 5.5 | Fallback: GPT-6.1 Sol |
| Critical-field cross-check (permit no., registration, company name) | GPT-6.1 Sol | — |
Verify exact OpenRouter model IDs at build time. Expected running cost: about ₹3,500–7,000/month in season.

## 6. Not now (design data model so they fit later)
Corporate / family-office clients, international trips, empty-legs board, client portal, e-sign API, WhatsApp Business API, payment links, charter marketplace APIs, contract-risk analysis, news monitoring.

## 7. Seed data and tests
- Seed fake data only: "Planner P1–P5", "Operator A–D", weddings "W-101–W-106", with legs, rates and payments in different statuses. Never real company names or real NSOP numbers.
- Settings seed: markup 10%, quote validity 24 h, target ₹20,00,000/month, GST placeholders (flagged), ID retention 30 days, AI cap ₹10,000.
- Tests: every hard rule in 4.3; every AI prohibition; money formatting; margin/GST/commission maths; AI gateway schema validation, retry and fallback; redaction; the full flow enquiry → rates → quote → signed & paid → flying → done.

## 8. Definition of done
- [ ] I log in on my phone and the Today screen shows what to do next.
- [ ] I paste a planner's WhatsApp message and get a wedding with legs, missing details and a draft reply.
- [ ] I get ranked verified operators per leg and draft rate requests in one tap; pasted replies fill the comparison.
- [ ] I can send a multi-leg quote PDF within 15 minutes of the enquiry.
- [ ] Unverified/expired operators cannot be quoted (API + UI).
- [ ] A wedding cannot be confirmed before signed terms + payment; payouts/commission blocked until client money arrives.
- [ ] All 3 agreements generate as PDF with data filled in, watermarked until lawyer-approved.
- [ ] Supply finder builds `FOUND` operator profiles with sources; critical fields cross-checked; only I can verify.
- [ ] Planner finder produces approved planners exportable as CSV.
- [ ] AI cost page and ₹10,000 cap work.
- [ ] All tests pass; deploys to Railway + Vercel following the README.

Start now: plan, data model and all your questions in one batch.
