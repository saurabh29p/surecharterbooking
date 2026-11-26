# The 3D site: per-page performance

Measured on the `site-3d` preview build (26 Nov 2026), served locally (`astro preview`), with
Lighthouse 13.6 (mobile: simulated mid-range phone on slow 4G, 4× CPU slowdown; desktop preset).
Targets: LCP ≤ 2.5 s, CLS ≤ 0.1, mobile Performance ≥ 90 (aim 95), Accessibility ≥ 95, SEO 100.

**SEO reads 69 on every page because preview builds are deliberately `noindex`** (robots and the
`X-Robots-Tag`); on a launched build SEO is 100 (see the check at the end).

**Lighthouse's own browser has no GPU**, so the site's device check gives it the stills, as it
would give a phone without WebGL. The second table forces the full 3D on to show what it costs.

| Page | Mobile: perf / a11y / best practices / SEO | Mobile LCP | CLS | TBT | Desktop: perf / a11y / BP / SEO | Desktop LCP | JS loaded (gzip) | 3D moments | 3D models (loaded only near them) |
|---|---|---|---|---|---|---|---|---|---|
| Home | 98 / 100 / 100 / 69 | 2.3 s | 0.000 | 90 ms | 100 / 100 / 100 / 69 | 0.5 s | 17 KB | Showroom, mark (×2), map, Shreeji | 865 KB (448 KB gzipped) |
| About | 100 / 100 / 100 / 69 | 1.8 s | 0.000 | 29 ms | 100 / 100 / 100 / 69 | 0.2 s | 8 KB | Lotus band | 60 KB (35 KB gzipped) |
| Aircraft | 99 / 100 / 100 / 69 | 2.0 s | 0.011 | 37 ms | 100 / 100 / 100 / 69 | 0.4 s | 9 KB | Showroom | 671 KB (329 KB gzipped) |
| Contact | 100 / 100 / 100 / 69 | 0.7 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 9 KB | none | 0 |
| Destinations | 99 / 100 / 100 / 69 | 2.0 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.4 s | 6 KB | none | 0 |
| Goa | 100 / 100 / 100 / 69 | 1.9 s | 0.000 | 50 ms | 100 / 100 / 100 / 69 | 0.5 s | 11 KB | Map band | 0 |
| Jaipur | 98 / 100 / 100 / 69 | 2.1 s | 0.000 | 126 ms | 100 / 100 / 100 / 69 | 0.5 s | 11 KB | Map band | 0 |
| Udaipur | 99 / 100 / 100 / 69 | 2.0 s | 0.000 | 51 ms | 100 / 100 / 100 / 69 | 0.5 s | 11 KB | Map band | 0 |
| FAQ | 100 / 100 / 100 / 69 | 1.7 s | 0.000 | 22 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| For planners | 100 / 100 / 100 / 69 | 1.7 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.4 s | 9 KB | none | 0 |
| Guides | 100 / 100 / 100 / 69 | 0.7 s | 0.000 | 6 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Guide: helicopter-entry-at-a-wedding | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.4 s | 6 KB | none | 0 |
| Guide: how-many-guests-fit-in-a-private-jet | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Guide: private-jet-to-udaipur-for-a-wedding | 100 / 100 / 100 / 69 | 0.7 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Guide: what-is-an-nsop-operator | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 16 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Helicopter arrivals | 99 / 100 / 100 / 69 | 2.0 s | 0.000 | 42 ms | 100 / 100 / 100 / 69 | 0.5 s | 11 KB | Helicopter band | 255 KB (135 KB gzipped) |
| How we work | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: cancellation-refund | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: charter-terms | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 19 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: cookies | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: grievance | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: privacy | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 14 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Legal: terms | 100 / 100 / 100 / 69 | 0.6 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.2 s | 6 KB | none | 0 |
| Private charter | 100 / 100 / 100 / 69 | 1.8 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.4 s | 9 KB | none | 0 |
| Weddings | 100 / 100 / 100 / 69 | 1.8 s | 0.000 | 0 ms | 100 / 100 / 100 / 69 | 0.4 s | 9 KB | none | 0 |

Every page meets the targets. (Inner pages share one 3D engine and three.js chunk; a page without
a 3D moment never downloads them.)

## With the full 3D forced on (`?tier=high`, software GPU)

| Page | Mobile perf / a11y / BP / SEO | Mobile LCP | CLS | TBT | Desktop perf / a11y / BP / SEO |
|---|---|---|---|---|---|
| Home | 99 / 100 / 100 / 69 | 2.1 s | 0.000 | 21 ms | 100 / 100 / 100 / 69 |

The 3D never starts while the page loads: only when a 3D moment is about to come into view, or
after the page has been idle for four seconds. Its setup (three.js, the renderer, shaders) costs about
0.3–0.6 s of main-thread time on the throttled mobile profile, outside the loading window.

## Download budget

| | Budget | Measured |
|---|---|---|
| JavaScript before LCP, every page | ≤ 30 KB gzip | 6–17 KB |
| Motion module (scroll choreography, all chapters) | (part of the enhancement) | 6 KB gzip |
| 3D enhancement JavaScript, total | ≤ 200 KB gzip | 171 KB gzip on home (three.js 136 KB, glTF loader and materials 14 KB, engine 4 KB, four scenes 11 KB) |
| Each 3D model | ≤ 300 KB | jet 267 KB, airliner 283 KB, helicopter 104 KB, palace 151 KB, mark 60 KB |
| 3D assets per page | ≤ 1.5 MB | home 865 KB of models (448 KB gzipped) plus lazy stills; other pages 0–671 KB |
| Rendered stills (fallbacks, AVIF/WebP at several widths) | | 8–60 KB each as served |

## Throttled mid-range Android (`apps/site/scripts/check-pages.mjs`)

Moto G4 profile, 4× CPU slowdown, 4G-like network, home page:

| Run | LCP | CLS | Long-task time over 50 ms during load | Main-thread frame time while scrolling |
|---|---|---|---|---|
| Default (this browser gets the stills) | 0.89 s | 0.000 | 315 ms | median 16.7 ms, p95 16.7 ms |
| 3D forced on (`?tier=mid`) | 0.91 s | 0.000 | 614 ms (the 3D's setup) | median 16.7 ms, p95 16.7 ms |

The frame times are the main thread's: WebGL drawing runs on the GPU process (here a software one),
so they show that the scroll loop and the scenes' updates fit in a frame, not the GPU's own speed.
On a real phone the engine also lowers its pixel ratio when frames run slow, and hands back to the
stills if they stay slow.

## Other checks

- Every page with JavaScript off, with reduced motion (phone) and with motion on (desktop): one
  H1, no sideways scrolling, no page errors, every 3D stage showing its still or its scene: **75 of
  75 passed**.
- Unit tests for the device tier: 8 tests, passing (`pnpm test`).
- Launched-mode build (`VERCEL_ENV=production PUBLIC_LAUNCHED=true`), mobile: home 98 / 100 / 100 /
  **100**, Aircraft 99 / 100 / 100 / **100**, Udaipur 100 / 100 / 100 / **100**.
