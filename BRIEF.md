# BRIEF v2: Charter Desk — AI-assisted system for a private jet charter brokerage (India)

## 0. How to work
1. Read this whole brief.
2. Reply with: a short build plan, the data model, and ALL your questions in ONE batch. Wait for my answers.
3. Then build in this order: Core (section 4) → AI gateway (5.1) → Supply engine (5.2) → Deal copilot (5.3) → Assistant (5.5) → Lead finder (5.4).
4. Small, working commits. Each step must run and pass tests before the next. Tell me what you could not do.

---

## 1. Context
- Business: online broker of private jet charters in India. We do NOT own or operate aircraft. We find clients, get rates from licensed operators, add a margin (~8–15%), and arrange the flight.
- Entity: **Indicgems Exim LLP**. Keep this app fully separate from my other product (own repo, own database, own keys).
- Operators must hold a DGCA **Non-Scheduled Operator Permit (NSOP)**. DGCA requires operators to publish aircraft age, maintenance history and pilot experience on their websites, and is publishing NSOP safety rankings.
- Clients: wedding planners and families, corporate CXOs, family offices, business owners flying abroad.
- Target: ₹20 lakh margin per month.
- One user (me) now; a second team member later. I work mostly from my phone: every screen must be mobile-first.
- Goal of the whole system: **close more deals faster with verified supply.** Every feature must help with one of: finding/verifying supply, answering enquiries fast, quoting accurately, following up, collecting payment safely.

## 2. Stack
- Frontend: Vue 3 + TypeScript + Vite, Tabler UI.
- Backend: NestJS + TypeScript, TypeORM, PostgreSQL (with pgvector for search).
- Background jobs: a Postgres-backed queue (e.g. pg-boss) for scheduled crawls, alerts and AI jobs.
- Files: S3-compatible private bucket, signed URLs only.
- PDF and DOCX generation on the server.
- AI: **OpenRouter** API only (one key), behind our own AI gateway module (5.1).
- Deploy: backend + Postgres on Railway, frontend on Vercel.
- Monorepo `apps/web`, `apps/api`, `packages/shared`. One command to run locally. `.env.example` with every variable. Never commit secrets.

## 3. Hard rules (enforce in the backend, test each one)
1. **No quote with an unverified operator.** Quotable only if: NSOP verified by me, permit not expired, insurance verified and not expired, not blocked.
2. **No confirmation without signed terms + payment.** Booking → `CONFIRMED` only when client terms are marked signed AND required payment (default 100%) is recorded.
3. **Operator payout only after client money arrives.**
4. **Tax rates are settings,** never hard-coded (my CA sets GST rates/SAC codes). Warning banner until confirmed.
5. **Money** in integer paise; Indian formatting (₹1,23,45,678; ₹48.6L; ₹1.2Cr). Timezone Asia/Kolkata.
6. **Audit log** for every change to operators, quotes, bookings, payments, agreements, and every AI action.
7. **AI rules:**
   - AI can never: mark an operator verified, send any message/email/WhatsApp, sign or send agreements, confirm bookings, record or move money, delete data.
   - AI output is always a **draft or suggestion** with an Approve / Edit / Reject button. Only my click changes real records.
   - Every AI-found fact is stored with **source URL, date fetched, model used, and confidence**. No source → not saved as a fact.
   - Never send to any AI model: passenger ID documents, bank details, signed contracts, passwords. Redact phone numbers/emails of private individuals before AI calls unless the task needs them.
   - Monthly AI spending cap (setting). Stop AI jobs and alert me when reached.

## 4. Core modules (no AI needed)

### 4.1 Login
Email + password (argon2), rate-limited, seeded admin from env. Session/JWT with refresh.

### 4.2 Operator directory
- Operator: legal name, brand, CIN, GSTIN, NSOP permit no., permit issue/expiry, bases, website, safety-disclosure URL, DGCA safety rank (+ checked-on date + source), contacts, bank details (encrypted), notes.
- Aircraft: type, registration, category (turboprop/light/midsize/super-midsize/heavy/ULR), seats, year of manufacture, base.
- Documents: NSOP permit, insurance, signed operator agreement — each with expiry and a "verified by me on <date>" toggle.
- Status: `AI_FOUND` (unverified) → `PENDING` (contacted/docs requested) → `VERIFIED` → `EXPIRING_SOON` (≤30 days) / `BLOCKED`.
- Daily job: alerts at 30 and 7 days before expiry; auto-block on expiry.
- Operator scorecard: safety rank, profile completeness, average reply time to my rate requests, price competitiveness from my quote history, deals done.
- CSV import/export.

### 4.3 Enquiry inbox
- Sources: manual, public website form (DPDP consent checkbox + notice, honeypot, rate limit), pasted WhatsApp/email text (via 5.3).
- Fields: client, source, legs (from, to, date, time window), passengers, aircraft category, budget, notes.
- Pipeline: `NEW → RATES_REQUESTED → QUOTED → TERMS_AND_PAYMENT → CONFIRMED → FLOWN → CLOSED`, plus `LOST` with reason.
- Timers: time to first quote; time since last contact.

### 4.4 Quote builder
- Pick 1–5 quotable operators, record each net rate and conditions, compare side by side.
- Markup % or fixed; extras (catering, ground transport, décor) with cost and sell price; GST from settings.
- Show client price, operator cost, margin ₹ and %.
- Branded PDF quote naming operator and aircraft, validity (default 24 h), cancellation terms. Versions kept.

### 4.5 Agreements
- Templates in DB as Markdown with `{{placeholders}}`, editable; `lawyer_approved` flag + date; unapproved output carries "DRAFT – NOT FOR SIGNATURE" watermark.
- Seed 4 DRAFT templates in real Indian contract format (title; place and date; parties block with LLPIN/GSTIN and CIN/NSOP no.; recitals; definitions; numbered clauses; annexures; signature blocks; e-stamp and e-sign execution note):
  1. **Operator–Broker Agreement**: role (broker is not the carrier; operator keeps operational control), operator warranties (valid NSOP, airworthiness, insurance, qualified crew, notify on suspension), net rates, payment terms, cancellation schedule (Annex A), liability/indemnity/insurance minimums, non-circumvention (24 months default), confidentiality + DPDP Act 2023, force majeure, termination (immediate if NSOP suspended), Indian law, arbitration under the Arbitration and Conciliation Act 1996, seat [CITY].
  2. **Client Charter Terms + Booking Confirmation**: itinerary, aircraft, named operator, price and inclusions, payment schedule, cancellation (must match operator terms), passenger obligations and IDs, baggage, delays and pilot-in-command authority, broker's limited role, liability, disputes.
  3. **Referral / Commission Agreement** (planners, partners): commission basis, earned only after client pays and flies, payout timing, no authority to bind us, confidentiality.
  4. **Mutual NDA.**
- Generate from deal/operator data, edit, export PDF and DOCX, keep versions. Phase 1 signing: mark sent/signed + upload signed copy.

### 4.6 Bookings and payments
Payments in (amount, date, mode, reference, receipt), payouts out, rules 2 and 3, GST invoice PDF, trip-day checklist (manifest, IDs, operator confirmation, ground transport, catering).

### 4.7 Clients and partners
People/companies with type (wedding planner, family, corporate, family office, other), contacts, consent record, trip history, total margin, referral partner and commission owed.

### 4.8 Dashboard (mobile-first)
- **Today's actions first** (from 5.3): deals needing a reply, quotes expiring, follow-ups due, payments pending, operators expiring.
- KPIs: bookings value this month, margin this month vs ₹20L target, open enquiries, median time to first quote, quote→booking rate.
- Pipeline board.

### 4.9 Data protection (DPDP Act 2023 / Rules 2025)
Consent records (notice version, time, source); passenger IDs encrypted, access-logged, auto-deleted after retention period; export/delete a person's data (logged).

---

## 5. AI layer

### 5.1 AI gateway (build first; every AI feature goes through it)
- One module that calls OpenRouter. Each **task** has its own config in the database: model, fallback model, temperature (0–0.2 for extraction), max tokens, JSON schema.
- Use OpenRouter structured outputs (`response_format: json_schema`, `strict: true`) for every extraction task, plus the `response-healing` plugin. Validate again with Zod on our side; on failure retry once, then fallback model, then mark "needs review".
- Use OpenRouter's `web` plugin only for tasks that need live search.
- Log every call: task, model, tokens, cost, latency, input hash, output, linked record. Cost dashboard + monthly cap (rule 7).
- Redaction step before every call (rule 7).
- **Evaluation harness:** for each task keep a "golden set" of 30–50 examples I approve (input + correct output). A command runs any model against it and reports field-level accuracy, cost and speed. Model choices in section 6 are defaults; switch only when the harness shows a better score.

### 5.2 Supply engine (most important AI part)
Pipeline, run as background jobs:
1. **Discover**: find Indian NSOP operators from public sources: DGCA website pages and notices, DGCA safety rankings when published, operators' own websites (incl. their mandatory safety-disclosure page), public news. Respect robots.txt and site terms; no logins, no LinkedIn, no paid data scraping. Also accept my manual adds and CSV imports.
2. **Fetch**: save each page (text + URL + fetch date) so every fact can be traced.
3. **Extract**: AI pulls a structured profile (legal name, brand, NSOP no., bases, aircraft list with type/reg/seats/year, contacts published on the website, safety disclosures, empty-leg pages). Each field stores source URL, quote snippet, date, confidence.
4. **Cross-check**: critical fields (NSOP no., permit validity, aircraft registration, company name) are extracted by a second model from a different lab. If they disagree, or confidence is low, flag "needs review". Never auto-fill a critical field from one model alone.
5. **Profile**: create or update the operator as `AI_FOUND`, with a field-by-field diff when anything changes. Merge duplicates (same NSOP no. / CIN / website) with my approval.
6. **Verify (me only)**: checklist screen: request docs (AI drafts the message, I send it), upload NSOP permit + insurance, tick each field verified. Only then `VERIFIED`.
7. **Monitor**: monthly re-check of each operator's website and news; alert me on: new/removed aircraft, safety-disclosure changes, accident or suspension news, DGCA ranking changes. News alerts link to the article; AI writes a 2-line summary.
8. **Match**: for an enquiry, rank quotable operators by aircraft category, base distance to departure, seats, scorecard.

### 5.3 Deal copilot (the part that wins deals)
- **Parse enquiry**: paste a WhatsApp/email message (English, Hindi or Hinglish) → filled enquiry form + list of missing details + a draft reply asking for them.
- **Rate request (RFQ)**: one click drafts rate-request messages to the top 3–5 matched verified operators (WhatsApp text + email). I copy/send; I log the replies, or paste an operator's reply and AI extracts the rate and conditions into the quote builder.
- **Quote draft**: from the chosen rate, drafts the client message with the quote PDF.
- **Follow-ups**: if no reply in X hours, it shows the deal in Today's actions with a drafted follow-up.
- **Next best action** per deal (one line, with reason), e.g. "Quote expires in 3 h — send follow-up".
- **Daily brief** (8 AM IST on the dashboard): deals needing action, money due, operator alerts, new AI-found operators to review.

### 5.4 Lead finder (businesses only)
- Finds and researches **businesses**: wedding planners, event companies, luxury resorts and hotels, corporate travel desks, family offices — from public business sources.
- For each: website, city, what they do, public business contact, fit score with reason, source links, and a personalised first-message draft.
- I approve every lead and every message. Export approved leads as CSV for PitchPersona.
- Do not: scrape private individuals' data, use bought "HNI lists", bulk-message on WhatsApp, or contact anyone without a lawful basis. Store consent/opt-in status per contact.

### 5.5 Assistant (chat panel on every screen)
- Tool-calling agent over our own data. Read tools: search operators/aircraft/deals/clients, get scorecards, get today's actions. Draft tools: draft message, draft quote, draft agreement, fill form. **No tool that changes real records without my click** (it opens the form pre-filled; I press Save).
- Answers must cite the records they used (linked). If data is missing, it says so; it never guesses prices, permit numbers or availability.
- Example asks: "Verified midsize jets based in Mumbai with 8+ seats?", "Draft follow-up for the Jaipur wedding", "Which operators replied fastest this month?", "Explain clause 6 of this operator contract and flag risks".

### 5.6 Agreement helper
- Fill a template from deal data (no AI needed for this part).
- AI explains an uploaded operator contract in simple English, lists risky clauses (liability caps, cancellation mismatches with our client terms, missing insurance) with clause references. Always labelled "not legal advice — check with lawyer".

## 6. Default model routing (configurable; confirm with the eval harness)
| Task | Default model (via OpenRouter) | Fallback / cross-check |
|---|---|---|
| Supply engine: extraction from web pages | Claude Sonnet 5.5 | Cross-check critical fields with GPT-6.1 Sol |
| Supply engine: discovery with web search | Claude Sonnet 5.5 + `web` plugin | — |
| Enquiry parsing (incl. Hinglish) | Claude Sonnet 5.5 | GPT-6.1 Sol |
| Bulk/low-risk tasks (news summary, dedupe hints, tagging) | Claude Haiku 5.5 | DeepSeek V4.1 Flash |
| Drafting client/operator messages | Claude Sonnet 5.5 | — |
| Contract explanation, hard reasoning | Claude Opus 5.5 | GPT-6 Astra |
| Assistant (tool calling) | Claude Sonnet 5.5 | Claude Opus 5.5 |
| Embeddings (search) | OpenAI text-embedding-3-small | — |
Check each model's exact OpenRouter ID and structured-output support per provider at build time; prefer providers with native strict JSON schema.

## 7. Later phases (design the data model for them, don't build yet)
Payment links (Razorpay or similar), Indian e-sign integration, WhatsApp Business API inbox, empty-legs board with share images, charter marketplace API (e.g. Avinode), client portal, team roles, reports.

## 8. Seed data and quality
- Seed only fake data ("Operator A", "Client X"), never real names or real NSOP numbers.
- Settings seeded: markup 10%, quote validity 24 h, target ₹20,00,000/month, GST placeholders, AI cap ₹[X]/month.
- Tests: every hard rule in section 3 (including each AI prohibition), money formatting, GST/margin maths, end-to-end flow enquiry → rates → quote → terms → payment → confirmed → flown, AI gateway schema validation and fallback, redaction.
- Golden sets: create a starter set per AI task from fake data; I will add real examples.
- README: setup, run, test, seed, eval harness, deploy.

## 9. Definition of done
- [ ] I log in on my phone and see Today's actions first.
- [ ] Supply engine builds `AI_FOUND` operator profiles with source links for every field; critical fields are cross-checked; only I can mark `VERIFIED`.
- [ ] Monthly monitoring alerts me to changes and news.
- [ ] I paste a WhatsApp enquiry and get a filled form, missing details and a draft reply.
- [ ] One click drafts rate requests to the best 3–5 verified operators.
- [ ] Unverified/expired operators cannot be quoted (API + UI).
- [ ] I can send a PDF quote within 15 minutes of an enquiry.
- [ ] All 4 agreements generate as PDF/DOCX with data filled in.
- [ ] A booking can't be confirmed before signed terms + payment.
- [ ] Assistant answers from my data with record links and never changes records on its own.
- [ ] AI cost dashboard and monthly cap work.
- [ ] All tests pass; deploys to Railway + Vercel with README steps.

Start now with the plan, data model and your questions.
