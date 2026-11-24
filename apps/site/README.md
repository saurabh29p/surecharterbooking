# apps/site — Vaanika public website (flyvaanika.com)

Static Astro site. Brief: [WEBSITE.md](../../WEBSITE.md). Design files: [design/](../../design/).
Research: [docs/WEBSITE-RESEARCH.md](../../docs/WEBSITE-RESEARCH.md).

## Run it

```bash
pnpm --filter @shubhjets/site dev        # http://localhost:4321
pnpm --filter @shubhjets/site build      # static files in apps/site/dist
pnpm --filter @shubhjets/site typecheck  # astro check
pnpm --filter @shubhjets/site test       # form and attribution logic
```

The enquiry form posts to the desk API. Locally, start the API (`pnpm dev` at the root); its default
`SITE_ORIGINS` already allows `http://localhost:4321`.

## Settings

| Variable | What | Example |
|---|---|---|
| `PUBLIC_SITE_URL` | Canonical address | `https://flyvaanika.com` |
| `PUBLIC_API_URL` | Desk API for forms and taps | `https://api.flyvaanika.com` (set on Vercel preview and production since 24 Nov 2026) |
| `PUBLIC_WHATSAPP_NUMBER` | WhatsApp, digits with country code | `919812345678` |
| `PUBLIC_PHONE` | Call number, digits with country code | `919812345678` |
| `PUBLIC_GOOGLE_ADS_ID` | Optional Google Ads conversion ID | `AW-123456789` |
| `PUBLIC_LAUNCHED` | `true` only on launch day, on Vercel production. Until then every build is a preview: banners, "verify" tags, `noindex` | |

No secrets belong here: everything is public and baked into the HTML.

## Where things live

- `src/config/company.ts`: every business detail (legal name, LLPIN, GSTIN, address, emails,
  grievance officer). Placeholders are listed in [PLACEHOLDERS.md](PLACEHOLDERS.md).
- `src/content/`: destinations, FAQ, guides and legal pages as Markdown. Add a page by adding a file.
- `src/assets/photos/`: photos (placeholders until launch; keep the file names to swap them).
- `VERIFY.md`: every estimated fact (flight times, seats, airports) to confirm before launch.

## Until launch

Every page is `noindex`, `robots.txt` disallows everything and preview builds show a banner while
placeholders remain. Launch steps are in WEBSITE.md §13, phase 6.
