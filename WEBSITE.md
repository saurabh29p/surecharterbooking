# WEBSITE — Vaanika public site (`apps/site`)

Prompt for Claude Code. This replaces the old ShubhJets website brief.
Read it with `UX.md` (§6 is for the website) and `docs/WEBSITE-RESEARCH.md` (the research behind every choice here).
**Do not write code until you have sent me your plan and all your questions in one batch, and I have answered.**

---

## 0. Brand change (applies to the whole repo)

- The client-facing brand is now **Vaanika** ("Vaani + Kalika"). Domain: **flyvaanika.com** (not bought yet; I will buy it).
- Legal line, used everywhere: **"Vaanika is a brand of Indicgems Exim LLP."**
- Domains: `flyvaanika.com` + `www.` → website (Vercel, `apps/site`); `app.flyvaanika.com` → desk; `api.flyvaanika.com` → API. Email sends as `@flyvaanika.com`.
- In `BRIEF.md`, `README.md`, `docs/DEPLOY.md`, `docs/GO-LIVE.md`, the settings seed and the quote/invoice PDFs: replace ShubhJets **wherever a client, planner or the public can see it** (brand name, PDF header, messages, domains, `SITE_ORIGINS`). Use the Vaanika logo files from `design/logo/` on PDFs.
- Keep internal names as they are: package names (`@shubhjets/*`), Railway project `shubhjets`, bucket `shubhjets-files`, database names, JWT issuer. Renaming those buys nothing and risks breakage. Say in `docs/DECISIONS.md` that this was deliberate.

## 1. What the site is for

Vaanika arranges **private jets and helicopters for Indian destination weddings**, mostly through wedding planners, plus a discreet private and business charter option. Vaanika is the client's **agent**; a DGCA-approved NSOP operator named in the quote flies every flight.

Goals, in order:
1. Enquiries from families and planners (WhatsApp tap, call, or the enquiry form → the desk).
2. Planners and hotel wedding teams sign up as partners.
3. Trust a careful family can check in five minutes (company details, how we verify operators, clear terms).
4. Rank on Google and get quoted by AI answers for "wedding + private jet/helicopter + city" questions.

## 2. Files I am giving you

| Path | What it is | How to use it |
|---|---|---|
| `design/mockup/home-desktop-part1…4.jpg`, `home-mobile-first-screen.jpg` | Screenshots of the approved home page (1440 px and 390 px) | The look to match |
| `design/mockup/home-desktop.html`, `home-mobile.html` | The approved mockup as static HTML | **Source of truth for colours, spacing, type sizes and the starting copy.** Open it in a browser; lift text from it |
| `design/logo/` | Final logo kit (SVG + PNG, `COLOURS.txt` says which file goes where) | Use these files. Never redraw, recolour or re-letter the logo |
| `design/brand/` | Logo-with-meaning and logo-with-domain images | About page and social sharing |
| `design/photos/` | Placeholder photos used in the mockup | Read `design/photos/README.md` first |
| `design/video/` | Hero loop (720p, 2 MB), poster, 27 s brand film (720p) | Hero background and the "Watch the film" modal |
| `docs/WEBSITE-RESEARCH.md` | Competitor review, sitemap, legal, trust, SEO, AEO, infrastructure, speed budget, launch checklist | Follow it; where this file and the research differ, this file wins |

## 3. Logo, colours and type

- **Logo:** "K · Teen Pankh", a three-petal lotus with a crescent moon. Ivory petal = Maa Saraswati, gold centre petal = Maa Lakshmi, **blue (shyama) petal = Maa Kali**, crescent = Kali's chandra. Header: horizontal lockup (transparent version for the dark header). Favicon/app icons: the ready files in `design/logo/png/` and `svg/vaanika-favicon.svg`. Below 48 px use the `mark-small` files.
- **Colours** (exact values are in the mockup HTML; these are the main ones): midnight `#0B1020` background, deep panels `#0E1328` / `#121935`, ivory text `#F3EDE2`, muted text `#B5AE9F`, champagne gold `#D4B26A` with the gold gradient `#F4E3B5 → #D9BC78 → #B8924A → #8C6A2F` for the main button and accent words, one light section on ivory with dark text, and **shyama blue `#2C4FB0 → #16296B` only inside the logo** (no blue elsewhere unless I ask). Check every text colour for 4.5:1 contrast.
- **Type:** Bodoni Moda (headings, italic gold accent words) and Manrope (body, labels, buttons). Self-host both (latin subset, `font-display: swap`, preload the two files used above the fold). No Google Fonts request at runtime.
- **Motion** (from `UX.md` §6): slow trust-strip marquee that pauses on hover, gentle fade-up of sections once, cards lift and photos zoom slightly on hover, gold buttons lift with a soft glow. Everything still under `prefers-reduced-motion` (marquee becomes a static wrap, no video autoplay).

## 4. Stack and hosting

- **Astro** (static output) + TypeScript in `apps/site`, part of the existing pnpm workspace. Ship plain HTML; JavaScript only for the mobile menu, the film modal, the marquee pause and the forms (aim ≤ 30 KB compressed per page).
- **Vercel** project from `apps/site`, separate from the desk. Preview deployment for every change; send me the preview link at the end of each phase.
- **Content:** Astro content collections (Markdown) for destinations, guides and FAQ, so I can add pages later by adding a file.
- **Images:** Astro's image pipeline (AVIF/WebP, several widths, width/height set, lazy below the fold). Hero poster is the LCP image: preload it, no lazy-load.
- **Hero video:** muted, looping, `playsinline`, poster first; start loading after the poster paints; not loaded at all on `prefers-reduced-motion` or `Save-Data`. Below 768 px, use the poster image only unless the speed budget still passes with video.
- **Config in one place:** `src/config/company.ts` holds the legal name, LLPIN, GSTIN, address, phone, WhatsApp, emails, grievance officer, social links. Every page reads from it. Placeholders look like `[LLPIN]` and are listed in §11.
- **Environment:** `PUBLIC_SITE_URL`, `PUBLIC_API_URL` (e.g. `https://api.flyvaanika.com`), `PUBLIC_WHATSAPP_NUMBER`, `PUBLIC_PHONE`, `PUBLIC_GOOGLE_ADS_ID` (optional). No secrets in the site.
- **Analytics:** cookieless only (Vercel Web Analytics). Google Ads conversion tag only if `PUBLIC_GOOGLE_ADS_ID` is set, fired on form success and WhatsApp/call taps.
- **Security headers:** HTTPS, HSTS, a content security policy that allows only what the site uses, `Referrer-Policy: strict-origin-when-cross-origin`. No third-party chat widgets.
- **Until I say "launch":** every page is `noindex`, and `robots.txt` disallows all on preview URLs. The production `robots.txt` (at launch) is in §9.

## 5. Forms and taps (the API already exists: `apps/api/src/enquiries/`)

- **Enquiry form** → `POST {PUBLIC_API_URL}/api/public/enquiries`. Fields: name, WhatsApp number, email (optional), role (`FAMILY` / `PLANNER` / `HOTEL`), firm (planner/hotel only), wedding city or venue, wedding date, number of guests flying, "flying from" cities, message, consent (unticked box, required). Send the attribution fields (`page`, `leadSource: "WEBSITE"`, `utm*` from the URL kept for the session, `gclid`) and the spam traps the API expects (`companyWebsite` hidden honeypot, `elapsedMs` since the form opened). Match `enquiry.dto.ts` exactly; reuse its error messages inline.
- **Planner sign-up** on `/for-planners/` → `POST /api/public/partners` (see `PartnerSignupBody`).
- **WhatsApp and call taps** → `navigator.sendBeacon` to `/api/public/events` with `{ kind: "WHATSAPP" | "CALL", …attribution }`, then open the link. Never block the tap if the beacon fails.
- Add the site's origins to the API's `SITE_ORIGINS` (including the Vercel preview domain while testing).
- **On success:** a thank-you state that says when we reply (use "within 1 hour, 9 am – 9 pm IST" as a placeholder I will confirm) and offers WhatsApp. **On failure:** keep everything the person typed, show the error, offer WhatsApp with the details pre-filled.
- Consent text under the form (one line + link to the privacy notice). A separate, unticked box for marketing messages.
- Sticky WhatsApp button on every page (pulses once after 5 s, per `UX.md`), and a call button on mobile. WhatsApp link: `https://wa.me/<number>?text=<pre-filled wedding enquiry with the page name>`.
- Cloudflare Turnstile is **not** needed now (the API has honeypot, timing and rate limits). Add it only if spam gets through; that needs an API change too.

## 6. Pages at launch

Short, lowercase URLs ending in `/`. Each page has one job (details in `docs/WEBSITE-RESEARCH.md` → "Sitemap" and "What each key page contains").

| URL | Page | Notes |
|---|---|---|
| `/` | Home | Build exactly in the mockup's order (below) |
| `/weddings/` | Wedding flights | Families and guests; group sizes per aircraft class; what the quote includes; payment schedule; 6 FAQs |
| `/helicopter-arrivals/` | Helicopter arrivals + the Shreeji Arrival | Who does which permission (§7); limits; FAQs |
| `/destinations/` | Destinations hub | Cards with approximate flight times |
| `/destinations/udaipur/`, `/jaipur/`, `/goa/` | Destination pages | Answer-first; flight times from 4 cities; nearest airport; helicopter notes; best season |
| `/aircraft/` | Aircraft classes | Helicopter, light, midsize, super-midsize/large, group charter: seats, range, typical use. No operator logos or tail numbers |
| `/how-we-work/` | Our standard + how it works | The 4 checks, the 4 steps, sample quote, payment schedule, payment safety, agent line |
| `/for-planners/` | For wedding planners | Commission paid after the client pays; co-branded quotes; reply time; sign-up form |
| `/private-charter/` | Private & business | Discreet charters beyond weddings. Never name or picture politicians, celebrities or any real client |
| `/faq/` | FAQ | 15–20 questions grouped (safety, booking, payment, helicopters, cancellations); each answer starts with one direct sentence |
| `/about/` | About Vaanika | Name story (`design/brand/logo-meaning.jpg`), the LLP's details, founder photo + note (placeholder), how to verify us |
| `/contact/` | Contact & quote | Form, WhatsApp, call, email, address, grievance officer, reply time |
| `/guides/` + first 4 guides | Guides (blog) | Titles in the research doc (guides 1–4). Write drafts; mark every fact to check (§10) |
| `/legal/privacy/`, `/legal/terms/`, `/legal/charter-terms/`, `/legal/cancellation-refund/`, `/legal/grievance/`, `/legal/cookies/` | Legal | Drafts for my lawyer (§8) |
| `/404` | Not found | WhatsApp button + destinations list |

Later (not now): more destinations, more guides, `/hi/` Hindi pages.

**Home page order (from the mockup):** utility bar (brand-of line, GST-registered, WhatsApp) → header (logo, Our standard, Destinations, Jets & helicopters, The Shreeji Arrival, Private & business, For planners, "Plan my flight") → hero video with headline, sub-line, "Plan my wedding flight" and "Watch the film · 27s" → moving trust strip (9 promises) → The Vaanika Standard (4 checks) → three moments → destinations → fleet / aircraft classes → the Shreeji Arrival → how it works + sample quote (light section) → beyond weddings (private & business) → for planners → the name story → FAQ (5) → enquiry form → footer with company details. Mobile follows `home-mobile.html`.

## 7. Wording that must be exact (do not "improve" these)

- **Agent line** (footer of every page, quote section, FAQ, charter terms): "Vaanika arranges charters as an agent. Every flight is operated by a DGCA-approved NSOP operator named in your quote."
- **Never** say Vaanika is "DGCA certified/approved/licensed", an airline or an operator. Operators hold the permits, not us.
- **Never** show the DGCA logo, the State Emblem, any government seal, any operator, hotel or venue logo, or an aircraft registration. Do not name a hotel as a partner.
- **Helicopter landing permissions:** "coordinated", never "guaranteed". Who does what: the operator files the landing request; the venue owner gives the NOC; the district administration is informed and in practice gives its approval. Standard card 04 text: "For helicopters: the operator's landing request, the venue owner's NOC and the district's nod — all in place before you pay in full." Weather, elections and no-fly areas can still stop a flight; the pilot's decision is final.
- **Payment** (my CA will confirm before launch; mark it `[CA TO CONFIRM]` in code comments):
  - An advance when you accept the quote and sign (usually about half; at least what the operator asks).
  - The balance 7–10 days before the flight. For helicopters, the balance only once permissions are in place.
  - Extras (waiting, catering changes, extra legs) invoiced after the flight.
  - Bank transfer (NEFT/RTGS/IMPS) to Indicgems Exim LLP's current account. UPI only for small amounts. We do not accept cash.
  - A GST invoice for every payment.
- **Payment safety note** (how-we-work, FAQ, contact, footer of the sample quote): "We only accept payments to Indicgems Exim LLP's current account, and we never change bank details by message. Our bank details appear only inside your official quote. If anyone asks you to pay a personal account, call us first." **Never put the bank details on the website.**
- **Photos:** caption every stock or placeholder image "Illustrative" (the mockup does this). Never caption a stock photo as one of our events.
- **No invented proof:** no counts ("500+ weddings"), ratings, reviews, testimonials, press logos or client names. Where the mockup or a page needs them, put `[REAL TESTIMONIAL — add when we have one]` and keep it hidden in production.
- Flight times and seat counts are always "approximate" and depend on the aircraft.

## 8. Legal pages and company identity

- Footer on every page: Indicgems Exim LLP, LLPIN, GSTIN (Delhi), registered address, email, phone, the agent line, links to all six legal pages and the grievance officer.
- Draft all six legal pages from the research doc's "Policies and legal pages" table (DPDP privacy notice with the itemised data list, purposes, recipients, retention, how to withdraw consent and how to complain; charter terms with the agent role, quote validity, payment schedule, pilot authority, force majeure, liability limits, Delhi courts; cancellation back-to-back with the operator's terms; grievance officer with timelines). Put "DRAFT — pending legal review" at the top of each, visible only on preview builds. **No legal page goes live until I confirm my lawyer approved it.**
- The cookie notice stays short because we use cookieless analytics; list only what we actually store.

## 9. SEO and AEO

- One H1 per page with the main phrase; title ≤ 60 characters; meta description written as a direct answer; canonical URLs; Open Graph and Twitter images made from the brand (logo on midnight, or a page photo with the logo).
- Real text in HTML, never inside images or the video. Descriptive image file names and alt text.
- Internal links: each destination links to weddings, helicopter arrivals and contact; each guide links to one money page.
- **JSON-LD:** `Organization` + `TravelAgency` on home (legal name, logo, address, phone, `sameAs` social links); `Service` on weddings, helicopter arrivals and private charter; `BreadcrumbList` on inner pages; `Article` on guides; `FAQPage` on FAQ blocks (valid markup; Google no longer shows FAQ rich results, so it is for meaning only).
- `sitemap.xml` (production only) and, at launch, this `robots.txt`: allow all, explicitly allow `Googlebot`, `Bingbot`, `OAI-SearchBot`, `PerplexityBot`; point to the sitemap. (Leave `GPTBot` allowed unless I say otherwise.) No `llms.txt` needed.
- **AEO:** answer first, then detail; put citable facts in HTML tables (flight times by route, seats per aircraft class, who handles each helicopter permission, payment schedule); one consistent company description everywhere.
- Speed budget for the home page on a mid-range Android over 4G: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1, JS ≤ 30 KB compressed, page without video ≤ 1 MB, video ≤ 2.5 MB and only after the poster. Lighthouse mobile: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95.

## 10. Facts you must not invent

Flight times, airport capabilities (which airports take business jets, night landing), seat counts, prices, helicopter landing rules per state, venue names, distances: write them as best estimates **and wrap them in `[VERIFY]`**, and list every one in `apps/site/VERIFY.md` (page, sentence, what to check, with whom: operator / airport / lawyer / CA). I will confirm them with operators before launch. No prices on the site unless I give real ranges.

## 11. Placeholders I will fill

WhatsApp number, call number, emails (`hello@`, `grievance@flyvaanika.com`), LLPIN, Delhi GSTIN, registered address, grievance officer name and designation, founder photo and note, reply-time promise, social links, Google Business Profile link, Google Ads ID, real photos and video, real testimonials, lawyer-approved legal text, CA-approved payment wording. Keep the full list in `apps/site/PLACEHOLDERS.md` and show a warning banner on preview builds while any remain.

## 12. Photos and video (read `design/photos/README.md`)

The mockup photos are placeholders. Use them to build and preview, keep the "Illustrative" captions, and keep them easy to swap (one folder, descriptive names). Before launch they get replaced with our own or operator photos (with written permission) or re-licensed stock; I will tell you which. The Shreeji Arrival image is a composite: keep it captioned as illustrative.

## 13. Phases (send me a preview link and screenshots after each)

1. **Plan:** read everything, then send your plan, folder structure, list of components and all your questions in one batch. Wait for my answers.
2. **Home page** matching the mockup on desktop and mobile, header, footer, sticky WhatsApp, enquiry form wired to the API on a test database. Preview on Vercel.
3. **All other launch pages**, legal drafts, 404, `VERIFY.md`, `PLACEHOLDERS.md`.
4. **SEO/AEO, speed and accessibility pass:** JSON-LD, sitemap, OG images, Lighthouse and Web Vitals numbers in the report.
5. **Brand change in the desk** (§0): PDFs, messages, settings seed, docs. Run the existing tests.
6. **Launch with me** (only when I say): domain connected, placeholders filled, lawyer and CA sign-off, `noindex` removed, production `robots.txt`, Search Console and Bing Webmaster verified, sitemap submitted.

## 14. Done when

- [ ] Home matches the mockup at 360, 390, 768, 1024 and 1440 px.
- [ ] All launch pages built; every page passes the `UX.md` checklist.
- [ ] Enquiry form, planner form and WhatsApp/call taps reach the desk with page, lead source and UTM values (tested end to end).
- [ ] Speed budget and Lighthouse targets met on mobile; numbers in the report.
- [ ] §7 wording used exactly; no invented proof; every unverified fact in `VERIFY.md`.
- [ ] No DGCA logo, emblem, operator/hotel logo or registration anywhere.
- [ ] Brand change done in the desk and docs; tests pass.
- [ ] Deployed as a Vercel preview; production launch waits for my go-ahead.
