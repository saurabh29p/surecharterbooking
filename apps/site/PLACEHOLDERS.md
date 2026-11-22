# Placeholders to fill before launch (WEBSITE.md §11)

Preview builds show a banner while any of the business details below are still placeholders.
Most live in `src/config/company.ts`; phone numbers come from Vercel environment variables.

| What | Where it goes | Now |
|---|---|---|
| WhatsApp number | Vercel env `PUBLIC_WHATSAPP_NUMBER` (digits with 91, e.g. `919812345678`) | `+91 XXXXX XXXXX` |
| Call number | Vercel env `PUBLIC_PHONE` | `+91 XXXXX XXXXX` |
| Emails `hello@`, `grievance@flyvaanika.com` | `company.email` (already set; the mailboxes must exist) | set, mailboxes not created |
| LLPIN | `company.llpin` | `[LLPIN]` |
| Delhi GSTIN | `company.gstin` | `[DELHI GSTIN]` |
| Registered address and PIN | `company.address` | `[Registered address]`, `[PIN]` |
| Grievance officer name and designation | `company.grievanceOfficer` | `[GRIEVANCE OFFICER NAME]`, `[DESIGNATION]` |
| Founder name, designation, photo and note | `company.founder` (photo: `src/assets/photos/founder.jpg`) | placeholders |
| Reply-time promise | `company.replyTime` | "within 1 hour, 9 am – 9 pm IST" (to confirm) |
| Quote validity on the sample quote | `company.quoteValidity` | `[48] hours` |
| Social links (Instagram, LinkedIn, YouTube) | `company.social` (hidden while empty) | none |
| Google Business Profile link | `company.social.googleBusiness` | none |
| Google Ads conversion ID | Vercel env `PUBLIC_GOOGLE_ADS_ID` (optional) | none |
| Real photos and video | `src/assets/photos/`, `public/video/` (same file names) | Unsplash placeholders, captioned "Illustrative" |
| Real testimonials | not shown anywhere until real (`[REAL TESTIMONIAL — add when we have one]`) | none |
| Lawyer-approved legal text | `src/content/legal/*.md` | drafts (phase 3) |
| CA-approved payment wording | payment schedule text (marked `[CA TO CONFIRM]` in code) | draft |

The sample quote on the home page keeps `[REG]`, `[OPERATOR NAME]` and `₹ [YOUR PRICE]` on purpose:
it shows what every quote contains without naming a real operator or aircraft.
