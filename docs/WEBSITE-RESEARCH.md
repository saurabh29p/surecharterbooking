
# Vaanika website — research & plan

2026-11-21 · Saurabh Singh


## Summary: 10 decisions

Launch flyvaanika.com as a fast, static Astro site of about 14 pages plus 6 legal pages, say "agent, not operator" everywhere, and earn trust with verifiable facts, not big claims.

1. **Two separate things.** The public website lives at flyvaanika.com. The internal dashboard stays at app.flyvaanika.com. The website only sends enquiries into the dashboard.
2. **Start small, grow monthly.** About 14 pages at launch. Add one destination or guide page every 2–4 weeks.
3. **Say what we are.** Vaanika arranges flights as the client's agent. A licensed NSOP operator flies them. Global brokers state this plainly in their terms; we do the same on every quote page, the footer and the FAQ.
4. **Six legal pages before launch.** Privacy notice (DPDP), website terms, charter booking terms, cancellation and refund policy, grievance officer, cookie notice. Company identity shown on every page.
5. **Proof, not puffery.** No invented numbers, reviews or logos. Show the verification process, the company's legal details and named people. Add real photos and client words after the first weddings.
6. **SEO on specific questions.** Target "wedding + private jet/helicopter + city" searches with real destination pages. Set up a Google Business Profile as a service-area business.
7. **AEO = clear facts in plain HTML.** Google says normal SEO is enough for AI Overviews. Answer-first paragraphs, fact tables and consistent company facts across the web. Allow ChatGPT's and Perplexity's search crawlers. Skip llms.txt.
8. **Speed is a feature.** Pass Core Web Vitals on Indian 4G phones: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Hero video ≤ 2 MB with a poster image.
9. **WhatsApp first.** Every page has WhatsApp and call buttons. The form creates an enquiry in the dashboard and replies within a stated time.
10. **Lawyer and CA sign off first.** No legal page or price wording goes live without their review.


## What similar businesses do

The leading Indian player sells breadth (jets, helicopters, pilgrimage, rescue) and hides its role; global brokers state their agent role in writing. Vaanika's gap: a wedding specialist that is open about who flies you and how it checks them.

| Business | What they show | What we take | What we avoid |
|---|---|---|---|
| [JetSetGo home](https://www.jetsetgo.in/) | Booking form in the hero; "Enquire, Quote, Book" steps; aircraft classes; empty-leg deals; award banner; offices in 5 cities; footer with privacy, T&C, CSR policy and annual returns | The three-step promise; aircraft classes; legal documents in the footer | Stats shown with "+" but no numbers; no clear line on whether it is operator or broker |
| [JetSetGo JetSetWed](https://jetsetgo.in/jetsetwed) | One-line hero, 7 highlights, quote form with a package dropdown (engagement, wedding, celebrity, sports), "quote within 24 hours" | A stated reply time; a short form | No FAQs, no destination detail, no proof on the page |
| [LunaJets terms](https://www.lunajets.com/terms-conditions) | States it is an air charter broker acting as agent for the charterer, not an operator | The agent wording, adapted by our lawyer | — |
| [Air Partner terms](https://www.airpartner.com/media/cruffpat/de-premium-terms-pt-2019-english.pdf) | Acts on the charterer's behalf as agent only | The same plain disclosure | — |
| [ACS wedding guide](https://aircharterservice.com/about-us/news-features/blog/top-wedding-destinations-in-india) | A blog post ranking Indian wedding destinations, ending in a contact prompt | Destination guides as an SEO entry point | Generic copy with no flight times or permissions |
| [IndiaMART listings](https://m.indiamart.com/impcat/private-charter-services.html) | Hourly prices for jets and helicopters, star ratings, "call now" | Proof that Indian buyers expect a price anchor | Unverified prices and ratings |

**Open decision:** publish indicative price ranges per route ("from ₹X, all-in") or not. Ranges help buyers and answer engines, but must come from real operator quotes. Decide after the first 5 quotes.


## Sitemap

Launch with 14 content pages and 6 legal pages; every URL is short, lowercase English, and ends in a slash. Each page has one job.

| URL | Page | Its one job | When |
|---|---|---|---|
| / | Home | Show the promise and the proof in 60 seconds; start an enquiry | Launch |
| /weddings/ | Wedding flights | Explain private jets for families and guests; destinations, aircraft, steps | Launch |
| /helicopter-arrivals/ | Helicopter arrivals and the Shreeji Arrival | Explain the entrance, permissions and limits honestly | Launch |
| /destinations/ | Destinations hub | List destinations with flight times from major cities | Launch |
| /destinations/udaipur/ | Udaipur | Rank for "private jet / helicopter wedding Udaipur"; airport, times, venue notes | Launch |
| /destinations/jaipur/ | Jaipur | Same for Jaipur | Launch |
| /destinations/goa/ | Goa | Same for Goa | Launch |
| /destinations/jodhpur/, /kerala/, /rishikesh/, /andaman/ … | More destinations | One every 2–4 weeks | Later |
| /aircraft/ | Aircraft classes | Helicopter to group charter: seats, range, typical use | Launch |
| /how-we-work/ | Our standard + how it works | The 4 checks, the 4 steps, sample quote, payment schedule | Launch |
| /for-planners/ | For wedding planners | Partner offer, commission, how we work under their name | Launch |
| /private-charter/ | Private and business | Discreet charters beyond weddings | Launch |
| /faq/ | FAQ | 15–20 real questions, answer-first | Launch |
| /about/ | About Vaanika | Name story, company details, the people | Launch |
| /contact/ | Contact and quote | Form, WhatsApp, phone, address, grievance officer | Launch |
| /guides/ | Guides (blog) | Answers to planning questions; feeds SEO and AEO | Later (first 4 at launch) |
| /legal/privacy/ | Privacy notice | DPDP notice | Launch |
| /legal/terms/ | Website terms | Use of the site | Launch |
| /legal/charter-terms/ | Charter booking terms | Agent role, payments, operator terms | Launch |
| /legal/cancellation-refund/ | Cancellation and refund | Who keeps what, when | Launch |
| /legal/grievance/ | Grievance officer | Name, contact, timelines | Launch |
| /legal/cookies/ | Cookie notice | What is stored in the browser | Launch |
| /hi/ | Hindi pages | Home, weddings, FAQ in Hindi | Later |

Also at launch: /sitemap.xml, /robots.txt, a custom 404 page with WhatsApp and the destinations list.


## What each key page contains

Every page follows one pattern: answer first, proof next, one clear next step, and the company identity in the footer.

- **Home:** the final mockup's order. Utility bar (company, GST, WhatsApp), header, hero video, trust strip, Vaanika Standard (4 checks), three moments, destinations, aircraft, Shreeji Arrival, how it works + sample quote, beyond weddings, planners, name story, FAQ (5), enquiry, footer.
- **Weddings:** who it suits (families, VIP guests, the couple); typical group sizes per aircraft class; destinations with times; what the quote includes; payment schedule in plain words; 6 wedding FAQs; enquiry form.
- **Helicopter arrivals:** what a helicopter entrance involves; who does what (operator files the landing request, venue owner gives the NOC, the district is informed or approves); limits (weather, elections, no-fly areas); the Shreeji Arrival package; FAQs.
- **Each destination page:** a 2-sentence answer ("Yes, you can fly to Udaipur by private jet; Maharana Pratap Airport takes business jets" — to be confirmed per airport); flight times from 4 cities; nearest airport and drive to popular venue areas; helicopter notes; best season; a photo; links to weddings and contact. Never name a hotel as a partner unless it is one.
- **Aircraft:** 5 classes with seats, typical range and use; a note that the exact aircraft decides the count; no operator logos or tail numbers.
- **How we work:** the 4 checks; the 4 steps; the sample quote; the payment schedule (advance, balance 7–10 days before, extras after); "we never ask you to pay a personal account"; "agent, not operator".
- **For planners:** commission model in words (paid after the client pays); co-branded quotes; how fast we reply; a short partner form.
- **Private charter:** same verification, discreet handling, GST invoice for companies; no named clients.
- **FAQ:** 15–20 questions grouped (safety, booking, payment, helicopters, cancellations); each answer starts with a one-sentence direct answer.
- **About:** the name story; Indicgems Exim LLP with LLPIN, GSTIN and registered address; the founder's name and photo; how to verify us.
- **Contact:** form (name, WhatsApp, date, guests, from, to/venue, consent box); WhatsApp and call; office address; grievance officer; stated reply time.


## Policies and legal pages

Six legal pages and a visible company identity cover the Indian rules that apply to a business selling services online; a lawyer must draft or review each one before launch.

| Page or element | Why it is needed | What it must say |
|---|---|---|
| Company identity (footer + About + Contact) | The [Consumer Protection (E-Commerce) Rules, 2020](https://taxguru.in/wp-content/uploads/2020/07/Consumer-Protection-E-Commerce-Rules-2020.pdf) apply to services sold over a digital network and require the legal name, address and website details to be displayed prominently | Indicgems Exim LLP; registered address; LLPIN; GSTIN; email; phone; "Vaanika is a brand of Indicgems Exim LLP" |
| Grievance officer page | The same rules require a grievance officer whose name, contact details and designation are shown on the platform | Officer's name, designation, email, phone; acknowledgement and resolution timelines (lawyer to set) |
| Privacy notice | The [DPDP Rules, 2025](https://www.mondaq.com/india/data-protection/1709066/key-highlights-of-the-digital-personal-data-protection-rules-2025) require a clear, standalone notice with an itemised list of data, the purpose, and links to withdraw consent and exercise rights; rights requests get answered within 90 days ([PIB](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)) | Data collected (name, phone, email, travel dates, guest names and ID details for manifests); why; who receives it (the operator, airport authorities); retention; how to withdraw consent; contact; how to complain to the Data Protection Board |
| Consent at the form | Same DPDP notice duty, at the point of collection | An unticked consent box and a one-line link to the notice; separate opt-in for marketing messages |
| Charter booking terms | Brokers worldwide state their agent role in writing ([LunaJets](https://www.lunajets.com/terms-conditions), [Air Partner](https://www.airpartner.com/media/cruffpat/de-premium-terms-pt-2019-english.pdf)) | Vaanika acts as the client's agent; the named NSOP operator operates the flight and its terms apply; quotes valid for a stated time; payment schedule; safety and pilot authority; force majeure; liability limits; governing law (Delhi courts) |
| Cancellation and refund | E-commerce rules expect clear refund and cancellation information; our rule is back-to-back with the operator | Slabs by days before departure; what is non-refundable (operator's retained amount, permission fees); refund timeline and mode; weather and permission refusals |
| Website terms | Standard protection for the site itself | Use of content, no reliance on indicative times or prices, links, liability, IP |
| Cookie notice | Needed only if we set non-essential cookies | List cookies; prefer cookieless analytics so the list stays short |
| Agent disclaimer (every quote, footer, FAQ) | Prevents anyone thinking we operate aircraft | "Vaanika arranges charters as an agent. Every flight is operated by a DGCA-approved NSOP holder named in your quote." |
| Payment safety note | Reduces payment-diversion fraud | We only accept bank transfers to Indicgems Exim LLP's current account; we never change bank details by message; call to confirm |

The DPDP Rules give businesses [an 18-month phased period](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) to comply, but building the notice and consent flow now is cheaper than retrofitting it later. This section is research, not legal advice.


## Trust plan

A new brand earns trust by being checkable: every claim on the site should be something a careful family could verify in five minutes.

| Show now | Add after the first weddings | Never show |
|---|---|---|
| LLP name, LLPIN, GSTIN, registered address | Real photos and a 30-second film of a Vaanika arrival (with written consent) | DGCA logo, State Emblem or any government seal ([State Emblem Act, s.3](https://blog.ipleaders.in/overview-state-emblem-india-prohibition-improper-use-act-2005/)) |
| Founder's name, photo and a short note | Client words with first name and city, with consent | "DGCA certified" about Vaanika (operators hold permits, not us) |
| The 4 verification checks and the sample quote | Planner partner names, with their permission | Operator or hotel logos without a written OK |
| Payment rule: company account only, GST invoice | Press mentions with links to the actual articles | Invented numbers ("500+ weddings"), star ratings or reviews |
| Grievance officer and reply times | Number of flights arranged, once it is real | Stock photos captioned as our events; tail numbers or registrations |
| Domain email (not Gmail) and a Delhi landline or WhatsApp Business number | A listing on WeddingSutra or WedMeGood | "Guaranteed" landing permissions or weather |


## SEO plan

Win narrow, high-intent searches ("helicopter for wedding in Udaipur") with one strong page each, rather than chasing "private jet charter", where JetSetGo and global brokers dominate. Search volumes are not checked yet; confirm them in Google Keyword Planner and Search Console after launch.

**Keyword clusters and their pages**

| Cluster | Example searches | Page |
|---|---|---|
| Wedding + jet | private jet for wedding India, charter flight for wedding guests | /weddings/ |
| Wedding + helicopter | helicopter entry for bride, helicopter for wedding price, groom helicopter entry | /helicopter-arrivals/ |
| Destination | private jet to Udaipur, helicopter wedding Jaipur, Goa wedding charter | /destinations/<city>/ |
| Process and trust | how to book private jet India, NSOP meaning, is charter safe | /how-we-work/, /faq/, guides |
| Planner | private jet partner for wedding planners | /for-planners/ |
| Hindi | shaadi ke liye helicopter, baraat helicopter | /hi/ (later) |

**On every page**

- One H1 with the main phrase; title ≤ 60 characters; meta description written as a direct answer.
- Real text in HTML, not inside images or the video.
- Internal links: each destination links to weddings, helicopters and contact; each guide links to one money page.
- Descriptive image file names and alt text; no keyword stuffing.

**Structured data (JSON-LD)**

- Organization and TravelAgency on the home page: legal name, logo, address, phone, sameAs links to social profiles.
- Service on /weddings/, /helicopter-arrivals/, /private-charter/.
- BreadcrumbList on every inner page; Article on guides.
- FAQPage is still valid markup, but Google [no longer shows FAQ rich results](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/); add it for meaning, not for a visual win.

**Local SEO**

- Google Business Profile as a **service-area business**: Google says a business without permanent on-site signage [is not eligible as a storefront](https://support.google.com/business/thread/169106319/how-do-i-list-my-business-location-on-google-when-i-work-from-home-and-also-offer-on-line-services?hl=en), and the address can be hidden with [up to 20 service areas](https://support.google.com/business/answer/9157481?hl=en.).
- Same name, phone and website everywhere: Business Profile, Instagram, LinkedIn, WeddingSutra, IndiaMART.

**First 8 guides (two a month)**

1. What is an NSOP operator, and why it matters for your wedding flight
2. Helicopter entry at a wedding: permissions, costs and limits
3. Private jet to Udaipur for a wedding: airports, times, tips
4. How many guests fit in a private jet? Aircraft classes explained
5. How charter pricing works: what is included, what is extra
6. Jaipur wedding by air: Jaipur airport and helicopter options
7. Planning guest arrivals for a destination wedding
8. Wedding flight checklist for families (dates, IDs, baggage, timing)


## AEO plan (AI answers)

There is no secret AEO switch: Google says a page only needs to be indexed and eligible for a snippet to appear in AI Overviews and AI Mode, with [no additional technical requirements](https://developers.google.com/search/docs/appearance/ai-features). What gets quoted is clear, unique, checkable facts.

**Do**

- **Answer first.** Each page and FAQ answer opens with one direct sentence, then detail. AI tools lift that sentence.
- **Publish citable facts** nobody else states clearly: flight times by route, seats per aircraft class, who handles each helicopter permission, the payment schedule. Keep them in HTML tables.
- **Be the same entity everywhere.** One name ("Vaanika, a brand of Indicgems Exim LLP"), one description, one phone, across the site, Business Profile, social profiles and directories. Link them with sameAs in the Organization markup.
- **Get mentioned elsewhere.** Planner websites, WeddingSutra or WedMeGood listings, a local news story after the first wedding. AI tools trust what several independent sites say.
- **Let AI search crawlers in.** Allow OAI-SearchBot in robots.txt; OpenAI says sites opted out of it [will not be shown in ChatGPT search answers](https://developers.openai.com/docs/gptbot). Also allow PerplexityBot, Googlebot and Bingbot (Copilot uses Bing). Blocking GPTBot (training) is a separate choice and does not affect search.
- **Write unique content.** Google's own guide says unique, compelling, useful content [matters more in the long run than any other suggestion](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
- **Measure.** Each quarter, ask ChatGPT, Perplexity, Gemini and Google AI Mode 10 fixed questions ("helicopter for wedding in Udaipur") and note whether Vaanika is cited.

**Skip**

- **llms.txt.** Google's John Mueller compared it to the old keywords meta tag and said [no AI system currently uses it](https://www.seroundtable.com/google-ai-llms-txt-39607.html). It costs little, but expect nothing from it.
- **Separate "AI versions" of pages or chunked rewrites.** Google's guide lists these among tactics you don't need.


## Infrastructure and speed

Build the site with Astro as static pages, host it on Vercel's CDN, and send enquiries to the existing dashboard API on Railway. Astro content pages often ship [0 KB of JavaScript](https://blog.logrocket.com/astro-vs-next-js-ssg-vs-react/), against roughly 90–130 KB of framework code for the same page in Next.js, which is the main lever for Core Web Vitals on mid-range Android phones.

[diagram: pages come from the CDN; only enquiries reach the dashboard]

Visitors and crawlers only ever touch static files on the CDN; the dashboard sees a request only when someone sends the form.

| Layer | Choice | Why |
|---|---|---|
| Framework | Astro, static output, in the existing monorepo (apps/site) | Plain HTML by default; JavaScript only for the menu, film modal and form |
| Hosting | Vercel (alternative: Cloudflare Pages) | Already used for the dashboard; buy the domain there (not bought yet); global CDN; preview link for every change |
| Content | Markdown files in the repo (Astro content collections) | No CMS cost or login to secure; add a headless CMS only if non-developers edit weekly |
| Images | Astro image pipeline: AVIF/WebP, several sizes, width and height set | Small files; no layout jumps (CLS) |
| Hero video | 720p H.264, about 2 MB, muted, looping, with a poster; hidden for reduced-motion users | Guides recommend [6–15 s loops of a few MB with a poster](https://elfsight.com/guides/video-background-website/) |
| Fonts | Bodoni Moda + Manrope, self-hosted, Latin subset, 2 files preloaded | No Google Fonts request; text appears at once |
| Enquiry form | Posts to the dashboard API (website enquiries); honeypot + Cloudflare Turnstile against spam; WhatsApp link as fallback | One source of truth for leads |
| Analytics | Cookieless analytics (Vercel Web Analytics or Plausible) + Google Search Console + Bing Webmaster Tools | Keeps the cookie notice short; Bing feeds Copilot |
| Speed monitoring | Real-user Web Vitals (Vercel Speed Insights) | Google judges the [75th percentile of real visits](https://web.dev/articles/defining-core-web-vitals-thresholds) |
| Security | HTTPS, HSTS, a content security policy, no third-party chat widgets | Fewer scripts, fewer risks, faster pages |
| Email | Domain email (hello@flyvaanika.com) | Gmail addresses lower trust |

**Speed budget for the home page on a 4G phone**

| Measure | Budget |
|---|---|
| Largest Contentful Paint | ≤ 2.5 s ([web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)) |
| Interaction to Next Paint | ≤ 200 ms |
| Cumulative Layout Shift | ≤ 0.1 |
| JavaScript | ≤ 30 KB compressed |
| Page weight without the video | ≤ 1 MB |
| Hero video | ≤ 2.5 MB, starts after the poster paints |


## Launch checklist

The site can be built in about two weeks once the owner supplies these items; the legal and identity items are the slowest, so start them first.

**Owner provides**

- Buy flyvaanika.com (and flyvaanika.in from an Indian registrar)
- Domain email: hello@ and grievance@flyvaanika.com
- WhatsApp Business number and a call number
- LLPIN, Delhi GSTIN, registered address for the footer
- Grievance officer: name and designation
- Founder photo and a 3-line note
- Lawyer: privacy notice, website terms, charter terms, cancellation and refund policy
- CA: GST wording on quotes and invoices; receipt-voucher process for advances
- Operator confirmation of flight times and aircraft seat counts used on the site
- Decision on showing indicative price ranges

**Build and launch**

- Astro site in apps/site with the final mockup's design
- 14 content pages, 6 legal pages, 404, sitemap.xml, robots.txt (OAI-SearchBot, PerplexityBot, Googlebot, Bingbot allowed)
- JSON-LD: Organization/TravelAgency, Service, BreadcrumbList, FAQPage, Article
- Enquiry form wired to the dashboard; test end to end
- Speed budget met on a mid-range Android phone over 4G
- Google Search Console and Bing Webmaster Tools verified; sitemap submitted
- Google Business Profile as a service-area business; verified
- Instagram, LinkedIn and directory profiles with the same name, phone and link

**First 90 days**

- Two guides a month; one new destination page a month
- Real photos and a client quote after the first wedding (with consent)
- Quarterly AI-answer check with the 10 fixed questions


## Sources

- [JetSetGo home page](https://www.jetsetgo.in/) and [JetSetWed page](https://jetsetgo.in/jetsetwed)
- [Air Charter Service: top wedding destinations in India](https://aircharterservice.com/about-us/news-features/blog/top-wedding-destinations-in-india)
- [LunaJets terms and conditions](https://www.lunajets.com/terms-conditions)
- [Air Partner premium terms](https://www.airpartner.com/media/cruffpat/de-premium-terms-pt-2019-english.pdf)
- [IndiaMART private charter listings](https://m.indiamart.com/impcat/private-charter-services.html)
- [Consumer Protection (E-Commerce) Rules, 2020 (text)](https://taxguru.in/wp-content/uploads/2020/07/Consumer-Protection-E-Commerce-Rules-2020.pdf)
- [PIB: DPDP Rules, 2025 notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf)
- [Mondaq: key highlights of the DPDP Rules, 2025](https://www.mondaq.com/india/data-protection/1709066/key-highlights-of-the-digital-personal-data-protection-rules-2025)
- [iPleaders: State Emblem of India Act overview](https://blog.ipleaders.in/overview-state-emblem-india-prohibition-improper-use-act-2005/)
- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google: optimizing for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [SEJ: Google drops FAQ rich results](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/)
- [SEJ: Google's llms.txt guidance](https://www.searchenginejournal.com/googles-llms-txt-guidance-depends-on-which-product-you-ask)
- [SERoundtable: no AI system uses llms.txt](https://www.seroundtable.com/google-ai-llms-txt-39607.html)
- [OpenAI: crawlers (OAI-SearchBot, GPTBot)](https://developers.openai.com/docs/gptbot)
- [Google Business Profile: service areas](https://support.google.com/business/answer/9157481?hl=en.)
- [web.dev: Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [LogRocket: Astro vs Next.js](https://blog.logrocket.com/astro-vs-next-js-ssg-vs-react/)
- [Elfsight: video background best practices](https://elfsight.com/guides/video-background-website/)
