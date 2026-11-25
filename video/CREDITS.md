# Vaanika brand film: credits and licences

The film was made in code for Vaanika. There is no stock footage, no stock music, no third-party
3D model and no real aircraft, venue, hotel, person, registration or operator mark. The only
third-party picture assets are CC0 skies and textures from Poly Haven, listed below.

## Picture

| What | How | Licence |
| --- | --- | --- |
| Lake palace, lawn, helipad, lanterns, diyas, hills, water | Procedural geometry and shaders written for this film (`src/models/palace3d.ts`, `PalaceMesh.tsx`, `Lake.tsx`, `Diyas.tsx`, `Hills3D.tsx`, `scenes/v2/S3Heli.tsx`). Generic Rajput-style palace, not any real building, hotel or venue | Vaanika's own |
| Private jet | Procedural geometry with PBR paint, metal and glass (`src/models/JetV2.tsx`). Generic type, no registration, no airline or operator logo | Vaanika's own |
| Helicopter | Procedural geometry with PBR livery (`src/models/HeliV2.tsx`). Generic type, no registration, no operator marks | Vaanika's own |
| Runway, marigold petals, contrails, glass cards, jaali, gold dust, moon | Geometry, shaders and particles written for this film | Vaanika's own |
| Skies and image lighting: `belfast_sunset_puresky`, `kloppenheim_02_puresky` | [Poly Haven](https://polyhaven.com) HDRIs, downloaded by `scripts/fetch_assets.py` (`public/assets/sky`, `public/assets/env`) | CC0 1.0 (public domain) |
| Textures: `asphalt_02`, `painted_plaster_wall`, `old_sandstone_02`, `leafy_grass` | [Poly Haven](https://polyhaven.com) PBR textures (diffuse, normal, roughness), `public/assets/tex` | CC0 1.0 (public domain) |
| Vaanika logo | The exact files in `design/logo/svg/`, copied and parsed by `scripts/sync-logo.mjs` (SHA-256 checksums in `src/data/logo.json`). The 3D bloom extrudes those paths and textures them with the browser's own render of each SVG element; the end card shows the stacked SVG file itself | Vaanika's own |
| Bodoni Moda (headlines, gold italic accents) | Google Fonts, `public/fonts/` | SIL Open Font License 1.1 (`public/fonts/OFL-BodoniModa.txt`) |
| Manrope (labels, subtitles, URL) | Google Fonts, `public/fonts/` | SIL Open Font License 1.1 (`public/fonts/OFL-Manrope.txt`) |

## Sound

| What | How | Licence |
| --- | --- | --- |
| Score: tanpura drone, santoor-style plucks in Raag Bhupali, strings, low pulse, final chord | Synthesised from scratch by `scripts/compose.py` (additive synthesis, filtered noise, synthetic reverb). No samples | Vaanika's own |
| Sound design: jet spool-up, roar and doppler pass, rotor thump and downwash, petals, glass chimes, wipe and contrail whooshes, logo bells | Synthesised by `scripts/compose.py`. No samples or recordings | Vaanika's own |
| Female voiceover (`audio/vo1.wav` to `audio/vo5.wav`) | Generated with **Kokoro-82M** (hexgrad), voice `hf_beta`, British-English G2P (misaki), by `scripts/tts.py` | Kokoro code and weights: Apache License 2.0 (commercial use allowed). misaki: Apache 2.0 |
| G2P fallback used by misaki | espeak-ng via `espeakng-loader`, run as a build tool only | GPL-3.0 (tool only; the generated audio is not covered) |
| Subtitle timings | Measured from the pauses in the voice files by `scripts/vo_timings.py` (NumPy) | Vaanika's own |

## Software used to make it

| Software | Licence |
| --- | --- |
| Remotion 4 (`remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/three`) | **Remotion License**: free for individuals, for-profit organisations with up to 3 employees, and non-profits. A for-profit company with 4 or more employees needs a paid Remotion Company License (see remotion.dev/license). |
| three.js, React, @react-three/fiber | MIT |
| NumPy, SciPy, soundfile, Pillow | BSD-style |
| pyloudnorm | MIT |
| librosa (analysis only) | ISC |
| PyTorch (runs Kokoro) | BSD-3-Clause |
| FFmpeg / x264 (encoding, as command-line tools) | LGPL / GPL (tools only) |

## Claims on screen

The film says only what Vaanika's site already says: flights by DGCA-approved NSOP operators,
checks before quoting (permit, aircraft papers, insurance), one all-in price with a written quote
and GST invoice, one coordinator on WhatsApp. It never shows a DGCA logo or government emblem,
never says Vaanika itself is DGCA certified or approved, and shows no prices, numbers, reviews or
testimonials.
