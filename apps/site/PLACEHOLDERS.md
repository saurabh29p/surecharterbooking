# Hidden until filled in (WEBSITE.md §11)

The site launched on 24 Nov 2026 with every unconfirmed detail **hidden**, not shown as a placeholder.
Each item below switches itself back on, on every page at once (header, footer, contact, about,
legal "Contact" blocks, structured data), as soon as its real value replaces the placeholder and
the site is redeployed. The switches live in `src/config/company.ts` (`show`, `MAILBOXES_READY`,
`QUOTE_VALIDITY`). Preview builds list in their banner what is still hidden.

| What | How to switch it on | Hidden now |
|---|---|---|
| WhatsApp buttons (header, sticky bar, forms, CTA bands, 404) | Vercel env `PUBLIC_WHATSAPP_NUMBER` (digits with 91, e.g. `919812345678`), then redeploy | yes |
| Call buttons (sticky bar, menu, contact, about) | Vercel env `PUBLIC_PHONE`, then redeploy | yes |
| Emails `hello@`, `grievance@flyvaanika.com` | create the mailboxes, then set `MAILBOXES_READY = true` in `company.ts` | yes |
| LLPIN | `company.llpin` | yes |
| Delhi GSTIN (and "GST-registered" in the top bar) | `company.gstin` | yes |
| Registered address and PIN | `company.address.street`, `company.address.postalCode` | yes (shows "New Delhi") |
| Grievance officer name and designation | `company.grievanceOfficer` | yes (legal pages point to the enquiry form) |
| Founder block on About | `company.founder` (name and note; photo: `src/assets/photos/founder.jpg`) | yes |
| Quote validity on the sample quote | `company.quoteValidity`, e.g. `'48 hours'` | shows "a limited time" |
| Reply-time promise | `company.replyTime` | shown: "within 1 hour, 9 am – 9 pm IST" (to confirm) |
| Social links, Google Business Profile | `company.social` | yes (hidden while empty) |
| Google Ads conversion ID | Vercel env `PUBLIC_GOOGLE_ADS_ID` (optional; update the cookie notice first) | off |
| Guides (hub link and sitemap entry) | `src/content/guides/*.md`: set `draft: false` once figures are checked | yes (4 drafts) |
| Real photos and video | `src/assets/photos/`, `public/video/` (same file names) | Unsplash placeholders, captioned "Illustrative" |
| Real testimonials | not shown anywhere until real | none |
| Lawyer-approved legal text | `src/content/legal/*.md`; open points in `LEGAL-REVIEW.md` | live with "Under legal review" |
| CA-approved payment wording | payment schedule text (`src/data/facts.ts`, marked `[CA TO CONFIRM]` in code only) | draft wording live |

**Co-branded quotes:** the planner page offers quotes "under your firm's name alongside ours". The desk's quote PDF doesn't add a planner's name yet; that's a small desk change to make before the first planner asks.

The sample quote on the home page says "registration shown", "Named in your quote" and "one written
price" on purpose: it shows what every quote contains without naming a real operator or aircraft.
