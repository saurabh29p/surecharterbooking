# 3D assets (the website's 3D scenes)

| File | What | Source and licence |
|---|---|---|
| `jet.glb` | Generic business jet, gear down | The brand film's own procedural model (`video/src/models/JetV2.tsx`), our work. No registration, operator logo or livery. |
| `airliner.glb` | Generic rear-engined regional airliner (group charter) | The same model stretched, with a denser window row; our work. |
| `helicopter.glb` | Generic twin-engine helicopter, rotor as its own node | The film's `HeliV2.tsx`; our work. |
| `palace.glb` | Generic Rajasthani palace (not a real building or hotel) | The film's `palace3d.ts`; our work. |
| `mark.glb` | The Vaanika mark, each element extruded from the logo file's own path | `design/logo/svg` via the film's `logoGeometry.ts`. Faces are drawn at run time from each element's own SVG (exact fills and gradients), never redrawn. |
| `stills/*.jpg` | Rendered stills of each 3D moment (fallbacks) | Rendered from these scenes. |
| `../../three/data/coast.json` | India's coastline only (no land borders) | Natural Earth 1:50m coastline, public domain (naturalearthdata.com); made by `apps/site/scripts/coastline.py`. |

No other 3D asset, texture or HDRI is downloaded: reflections come from a small sky painted in code
(`src/three/assets.ts`).

**Rebuild the models** on the `video-film` branch: `cd video && node scripts/export-gltf.mjs`, then
copy `out/gltf/*.glb` here. The material names and the livery shaders travel inside the files.

**Re-render the stills** after changing a scene: build, `npx astro preview`, then run the capture
script described in `docs/site-3d-storyboard.md` (Key-moment stills).
