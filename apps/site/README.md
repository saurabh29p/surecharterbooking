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

## 3D and motion (branch `site-3d`)

The site is one scroll journey with a 3D moment per chapter. Storyboard and stills:
[docs/site-3d-storyboard.md](../../docs/site-3d-storyboard.md); choices: [docs/DECISIONS.md](../../docs/DECISIONS.md).

- `src/motion/`: easing and duration tokens (the same values as the `--ease-*`/`--dur-*` CSS
  properties), the device tier (`tier.ts`, unit-tested), the one scroll loop (`loop.ts`) and one
  module per chapter (`chapters/`, loaded only on pages that have that chapter).
- `src/three/`: one WebGL renderer on one fixed canvas (`engine.ts`), the sky, models and materials
  (`assets.ts`) and the scenes (`scenes/`). Each 3D moment is a `<Stage>` in the page with its
  rendered stills; `<SceneBand>` is the inner pages' version.
- `src/assets/3d/`: the film's models as glTF, the stills, and their sources ([README](src/assets/3d/README.md)).
- Nothing loads before first paint except a tiny inline switch: the scroll choreography is a
  separate chunk, and the 3D (three.js) loads after the page has settled, on capable devices only.
- Checks: `pnpm test` (tier logic), `node scripts/check-pages.mjs` against `astro preview` (every
  page with JavaScript off, reduced motion and motion on, plus a throttled Android run), and
  `node scripts/render-stills.cjs` to re-render the stills after changing a scene.
- Testing switches: `?tier=high|mid|low`, `?motion=off`, `?debug` (exposes the engine as
  `window.vaanikaEngine`).

## Until launch

Every page is `noindex`, `robots.txt` disallows everything and preview builds show a banner while
placeholders remain. Launch steps are in WEBSITE.md §13, phase 6.
