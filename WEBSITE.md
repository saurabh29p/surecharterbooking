# WEBSITE — ShubhJets public site (`apps/site`)

Prompt for Claude Code. Build only when I say so (after Phase A of `BRIEF.md`).
A fast, elegant, mobile-first marketing site for ONE niche: **private jets for Indian destination weddings.**
The brand name is broad (ShubhJets) so we can add other services later; the content is wedding-only for now.
**UI/UX quality is a hard requirement:** follow `UX.md` (especially §6 for the website).

---

## 1. Goals
1. Get enquiries from families and planners (WhatsApp tap or enquiry form).
2. Recruit wedding planners and hotel wedding teams as partners.
3. Build trust: verified operators, clear terms, a real registered business.
4. Rank on Google for wedding-route searches (e.g. "Delhi to Udaipur private jet wedding").

## 2. Stack
- Astro (static, very fast) with TypeScript, deployed on Vercel. Minimal JavaScript; animations in CSS and inline SVG.
- Enquiry form posts to the API endpoint described in `BRIEF.md` §5.7 (lead source + UTM fields).
- Privacy-friendly analytics (e.g. Vercel Analytics or Plausible) + Google Ads conversion tag on form submit and WhatsApp tap.
- Lighthouse: Performance ≥ 90 on mobile, Accessibility ≥ 95, SEO ≥ 95.

## 3. Look and feel ("night wedding")
Use this look; do NOT use a generic template or default theme.
- **Colours:** midnight `#0B1020` (main background), deep panels `#0E1328` / `#121935`, ivory text `#F3EDE2`, muted text `#B5AE9F`–`#C9C2B5`, champagne gold `#D4B26A` (accents, buttons), marigold `#E8A33C` / `#F1C25B` and sindoor `#C2412D` only for small decorative touches. One light section in ivory `#F6F1E7` with ink `#1A1A22` and dark gold `#7A5A1E`. Check all text for 4.5:1 contrast.
- **Fonts (Google Fonts):** Bodoni Moda for headings (with italic gold accent words), Manrope for body and UI.
- **Motifs:** subtle jaali (lattice) pattern behind the hero at very low opacity; a small marigold garland and marigold flower dividers; thin gold rules; pill buttons.
- **Signature graphic:** an abstract route map (city dots only, NO country outline or borders) with gold arcs from Delhi and Mumbai to Udaipur, Jaipur, Jodhpur, Goa and Pantnagar; arcs draw in on load; a small jet glides along Delhi → Udaipur; stars twinkle.
- **Motion:** arcs drawing, slow gold shimmer on accent words, gentle garland sway, fade-up on scroll, cards lift on hover. All motion off under `prefers-reduced-motion`.
- **Imagery:** only images we have rights to: operator photos/videos with written permission and credit, our own shoots, or properly licensed stock. Never show another company's logo or aircraft registration without permission. Never imply we own aircraft. Until real images exist, use the SVG graphics.

## 4. Pages
1. **Home**: hero ("Arrive as if the celebration has already begun." + subline + "Plan guest flights" and "Talk on WhatsApp"), trust strip (DGCA-licensed operators only · options and quote within the hour · one coordinator · GST invoice), wedding routes, how it works (3 steps), for planners, safety, final call to action, footer.
2. **For planners & hotels** (most important page): what they get (commission on every booking, paid after the client pays; quotes in 1 hour under their name; backup aircraft; we never go around them), how it works, partner form.
3. **Route pages (5)**: Delhi→Udaipur, Mumbai→Udaipur, Delhi→Jaipur, Delhi→Jodhpur, Mumbai→Goa. Each: approximate flight time, suitable jet categories and seats, how many guests per jet, typical wedding timings, FAQ, enquiry form. Price shown only as "quote within the hour" unless I provide real ranges.
4. **Helicopter arrivals**: see §4a. Linked from the home page ("Arrive by helicopter") and the route pages.
5. **Safety**: only DGCA NSOP-licensed operators; how we verify (permit, insurance, aircraft and crew details shared before you confirm); the pilot's decision is final.
6. **How it works / FAQ**: pricing, payment (bank transfer), cancellation, guest IDs, luggage, how early to book, multi-city legs.
7. **About**: ShubhJets is a service of Indicgems Exim LLP; GSTIN; registered address; real phone; who we are.
8. **Contact**: WhatsApp, phone, email, form.
9. **Privacy policy** (DPDP Act 2023) and **Terms**.

## 4a. Helicopter arrivals
A page for the moment guests remember: the couple or family arriving at the venue by helicopter.
- **Services:** venue transfer from the nearest airport, bride/groom helicopter entry, flower shower over the ceremony, and short joyrides for guests.
- **How it works:** tell us the venue and date → we check the landing spot with a licensed operator → you get one price per service → we arrange the operator's landing-site check and help with local permissions → a weather backup plan is agreed before you confirm.
- **Be honest about limits:** landing needs a suitable, cleared spot and the local permissions (district administration, police, venue); flower showers need separate approval; helicopters fly in daylight and good weather only, and the pilot's decision is final. Say "subject to permissions and weather" wherever a helicopter service is offered.
- **Prices:** "quote within the hour", one price per service. Never show hourly rates.
- **Imagery:** only helicopter photos we have rights to (operator photos with written permission and credit, or licensed stock); no registrations or operator logos without permission. Until then, an SVG illustration in the night-wedding style.
- **Form:** the standard enquiry form plus a "Helicopter service" choice (transfer / entry / flower shower / joyrides) and the venue name, sent in the form's message (e.g. "Helicopter: flower shower at <venue>"); it reaches the desk with lead source and UTM like every other form, and I add the helicopter leg on the call.
- **SEO:** target "helicopter for wedding entry", "helicopter flower shower wedding <city>", "helicopter transfer to <venue city>". FAQ schema for the honest-limits questions.

## 5. Conversion
- Sticky WhatsApp button on every page (`https://wa.me/<number>?text=<pre-filled wedding enquiry>`), plus a click-to-call button on mobile.
- Short enquiry form: name, phone (WhatsApp), role (family / planner / hotel), wedding city, date, guests flying from which cities, consent checkbox. Honeypot + rate limit.
- Thank-you page that promises a reply within 1 hour and offers WhatsApp.
- Every form and WhatsApp tap carries the page, lead source and UTM values.

## 6. SEO
- One clear H1 per page; route pages target "<city> to <city> private jet (for wedding)".
- Unique titles and meta descriptions; Open Graph images in the brand style.
- Schema.org: Organization, LocalBusiness, FAQPage on FAQ sections, BreadcrumbList.
- `sitemap.xml`, `robots.txt`, canonical URLs, fast LCP, images in AVIF/WebP with sizes.
- Google Business Profile link in the footer.

## 7. Honesty rules (must follow)
- State clearly on every page footer: "ShubhJets is a charter broker. All flights are operated by DGCA-licensed non-scheduled operators named in your quote."
- No fake reviews, testimonials, client logos, ratings, counts or prices. Use placeholders like `[TESTIMONIAL — add when real]` until I give real ones.
- Flight times marked as approximate.

## 8. Placeholders I will fill
WhatsApp number, phone, email, GSTIN, registered address, domain (shubhjets.com / shubhjets.in), real photos/videos, real testimonials, Google Ads conversion ID.

## 9. Done when
- [ ] All 9 pages built, responsive from 360 px to 1440 px, matching the look in §3.
- [ ] Animations work and switch off with reduced motion.
- [ ] Enquiry form and WhatsApp taps reach the desk API with lead source + UTM.
- [ ] Lighthouse targets in §2 met on mobile.
- [ ] Honesty rules in §7 met; no invented content.
- [ ] Every page passes the `UX.md` quality checklist (buttons feel clickable, hover/press effects, smooth motion, no layout shift).
- [ ] Deployed on Vercel with the domain connected.
