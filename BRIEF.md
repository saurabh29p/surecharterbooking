# BRIEF v3: Wedding Charter Desk

A small, fast internal tool for ONE niche: **private jet flights for Indian destination weddings, sold through wedding planners.**
If a feature doesn't help close a wedding deal, don't build it.

## 0. How to work
1. Read this brief. Reply with a short plan, the data model, and ALL questions in one batch. Wait for my answers.
2. Build in order: Core (section 3) → AI (section 4). Small working commits, tests passing at each step.

## 1. Context
- Business: jet charter broker (we don't operate aircraft) under **Indicgems Exim LLP**, India.
- Niche: destination weddings. Season Nov–Mar. Routes: Delhi/Mumbai (+ other metros) → Udaipur, Jaipur, Jodhpur, Goa, Jim Corbett (Pantnagar), and return.
- Channel: wedding planners send us weddings; they earn a referral commission.
- One wedding = 3–6 flight legs (VIPs, family, return).
- Goal: ₹20 lakh margin per month in season.
- One user (me), mobile-first.

## 2. Stack
Vue 3 + TypeScript + Tabler (web), NestJS + TypeORM + PostgreSQL (api), pg-boss jobs, private S3-compatible storage, PDF generation, OpenRouter for AI. Railway (api + db), Vercel (web). Monorepo, one command to run, `.env.example`, no secrets in git.

## 3. Core

### Objects
- **Planner** (partner): firm, city, contact person, phone, email, website, status (`TARGET → CONTACTED → CALL_DONE → ACTIVE → INACTIVE`), commission %, referral agreement signed?, weddings this season, commission owed, next follow-up date.
- **Wedding** (the deal): planner, client family/contact, venue city, wedding dates, guest count flying, status (`ENQUIRY → RATES_REQUESTED → QUOTED → SIGNED_AND_PAID → FLYING → DONE`, or `LOST` + reason).
- **Leg** (many per wedding): from, to, date, time window, passengers, aircraft category, chosen operator, net rate, sell price, status.
- **Operator**: name, NSOP permit no. + expiry, insurance expiry, base(s), aircraft (type, registration, category, seats), contacts, documents, status (`FOUND → VERIFIED`, `EXPIRING_SOON`, `BLOCKED`), average reply time.
- **Guest manifest** per leg: name, phone, ID received (yes/no). ID files encrypted, auto-deleted after the wedding + retention days.
- **Payments**: client payments in, operator payouts out, planner commission out.

### Screens
1. **Today** (home): actions list, season margin vs ₹20L, weddings board, planner pipeline (see section 5).
2. **Wedding page**: legs table, rates from operators side by side, quote, manifest progress, money (paid / due / payouts / commission), documents.
3. **Planners**: list + pipeline + commission owed.
4. **Operators**: list by route coverage; verification checklist; expiry alerts.

### Hard rules (backend-enforced, tested)
1. Only `VERIFIED` operators (permit + insurance verified by me and not expired) can be quoted.
2. A wedding moves to `SIGNED_AND_PAID` only when client terms are signed and the required payment (default 100%) is recorded.
3. Operator payouts and planner commission only after client money is received.
4. GST rates are settings (my CA sets them). Money in integer paise, Indian format (₹24.0L), IST.
5. Audit log for every change and every AI action.

### Documents (PDF)
- **Multi-leg wedding quote** (all legs, aircraft, named operators, total, validity 24 h, cancellation terms).
- **3 agreement templates** (DRAFT until I tick "lawyer approved"): Operator–Broker Agreement, Client Charter Terms + Booking Confirmation, Planner Referral Agreement. Real Indian contract format: parties with LLPIN/GSTIN/CIN/NSOP no., numbered clauses, annex, signature blocks, e-stamp/e-sign note.
- GST invoice.

## 4. AI (OpenRouter) — 5 jobs only
All AI output is a **draft** with Approve / Edit / Reject. AI never: marks operators verified, sends messages, signs, confirms, records money. Never send passenger IDs or bank details to AI. Every AI call logged with cost; monthly cap in settings. Use structured outputs (`json_schema`, `strict: true`) + `response-healing` plugin, then validate with Zod.

1. **Paste-to-wedding**: paste a WhatsApp/email message from a planner (English/Hindi/Hinglish) → filled Wedding + Legs, list of missing details, draft reply asking for them.
2. **Rate requests**: for each leg, rank verified operators that fly that route/category (base, seats, reply speed, past prices) and draft one WhatsApp/email rate request per operator. Paste operator replies → AI extracts rate + conditions into the comparison.
3. **Quote + follow-up drafts**: draft the planner/client message with the quote; draft follow-ups when there's no reply in X hours; draft manifest/ID reminders before flight day.
4. **Supply finder**: find NSOP operators with jets that can serve the wedding routes, from public sources only (DGCA pages, operators' websites incl. their safety-disclosure pages). Store every field with source URL + date. Permit number and aircraft registration are double-checked by a second model; disagreement → "needs review". Status stays `FOUND` until I verify documents. Respect robots.txt; no logins, no scraping LinkedIn.
5. **Planner finder**: find wedding planners in Udaipur, Jaipur, Jodhpur, Goa, Delhi, Mumbai from public business sources: firm, website, city, public business contact, fit reason, personalised first-message draft. I approve each. Export CSV for PitchPersona. No private individuals' data, no bought lists, no bulk WhatsApp.

**Assistant panel** (on every screen): one chat box for these 5 jobs plus questions about my data ("which planners haven't heard from me in 7 days?", "verified heavy jets in Delhi?"). It answers with links to records, never guesses prices or permit numbers, and opens pre-filled forms instead of saving anything itself.

**Models (configurable per job):** Claude Sonnet 5.5 for all 5 jobs and the assistant; GPT-6.1 Sol as the second-model cross-check for permit numbers and registrations. Keep a 30-example test set per job and a command that scores any model on it before switching.

## 5. Today screen (exact content)
- **Actions** (AI-ranked, each with one button): e.g. "Wedding W-104: 2 of 4 rates in — chase Operator B", "Quote for W-107 expires in 3 h — send follow-up", "W-101 flies in 5 days — 6 guest IDs missing", "Planner P3: no reply in 7 days — send follow-up", "Operator C insurance expires in 9 days".
- **Season tracker**: margin this month vs ₹20L; weddings confirmed; average margin per wedding.
- **Weddings board** by status (card: wedding code, planner, city, date, legs, value, margin).
- **Planner pipeline**: target → contacted → call done → active, with counts.
- **Route coverage**: verified jets per route (e.g. DEL→UDR: 4 midsize, 1 heavy).

## 6. Not now
Corporate/family-office leads, international trips, empty-legs board, client portal, e-sign API, WhatsApp API, payment links, marketplace APIs, contract-risk analysis, news monitoring. Design the data model so these can be added later.

## 7. Seed, tests, done
- Seed fake data only ("Planner P1", "Operator A", "W-101").
- Tests: every hard rule, every AI prohibition, money/GST maths, flow enquiry → rates → quote → signed & paid → flying → done.
- Done when: on my phone I can paste a planner's WhatsApp message and, within 15 minutes, send a multi-leg quote using verified operators; the Today screen tells me exactly what to do next; it deploys with README steps.

Start with the plan, data model and questions.
