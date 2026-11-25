# video/ — the Vaanika brand film

A 35-second brand film made in code: Remotion + Three.js (PBR materials, GLSL shaders, CC0 HDRI
skies and textures from Poly Haven) for the picture, an original score and sound design
synthesised in Python, and a Kokoro text-to-speech voiceover.
Licences are in [CREDITS.md](CREDITS.md).

## Outputs

| File | What | Where |
| --- | --- | --- |
| `vaanika-film-master-1080p.mp4` | Master, 1920x1080, music + voice | GitHub release |
| `vaanika-film-subtitled-1080p.mp4` | 16:9 with burnt-in subtitles, for muted social posts | GitHub release |
| `vaanika-film-reels-1080x1920.mp4` | Reels cut with burnt-in subtitles | GitHub release |
| `web/vaanika-film-720p.mp4` | Web version for "Watch the film", 1280x720, under 3 MB | committed |
| `web/hero-loop-720p.mp4` | Muted 14 s seamless hero loop, no text, left third kept dark, under 2.5 MB | committed |
| `web/hero-poster.jpg` | Poster for the hero (the loop's first frame) | committed |
| `web/vaanika-film-thumbnail.jpg` | Thumbnail, 1280x720 | committed |

Large renders (`out/`) are git-ignored. `.github/workflows/film-release.yml` rebuilds everything
from these sources and attaches the files to a GitHub release. It runs when `RELEASE_VERSION`
changes on the `video-film` branch (it then creates that tag), or when a `film-v*` tag is pushed.

## How it fits together

- `src/data/timeline.json` is the single source of timing: 96 BPM (one bar = 2.5 s), scene cuts
  on downbeats, every visual event and every voice line. The score (`scripts/compose.py`) reads
  the same file, so the light wipes, the jet rotation and lift-off, the helicopter touchdown, each
  card, the contrail pass and each logo petal land on the music.
- Scenes are in `src/scenes/v2/` (S1 lake palace, S2 jet, S3 helicopter, S4 cards, S5 contrail
  pass, S6 logo). Models are in `src/models/` (procedural jet, helicopter and palace with PBR
  materials). `src/lib/Stage.tsx` is the shared look: HDR render, depth of field, bloom, ACES,
  one grade for the whole film (midnight blues, warm gold highlights), grain. `src/lib/hdri.tsx`
  draws the Poly Haven skies and lights the scenes with them.
- Rendering is split in two layers: the **plate** (WebGL picture, rendered at 90 fps and blended
  to 30 fps for motion blur; slow) and the **overlay** (headlines, cards, subtitles, end card;
  quick). `scripts/build.sh` joins and blends the plates, composites the overlays with ffmpeg and
  adds the audio mix. CI renders each plate in nine parallel frame ranges.
- `scripts/fetch_assets.py` downloads the CC0 skies and textures into `public/assets/` (committed,
  about 8 MB) and writes `src/data/assets.json`.

## Rebuild

```bash
cd video
npm ci
node scripts/sync-logo.mjs          # copy + parse the logo files from design/logo/svg
./scripts/render_plates.sh          # FilmPlate, HeroLoop, ReelsPlate -> out/renders (hours on a CPU)
./scripts/build.sh                  # overlays, mix, encodes, checks -> out/release and web/
```

Python 3.10–3.12 with `numpy scipy soundfile pyloudnorm` is needed for the mix; `kokoro`
only if you regenerate the voice.

Preview in the browser: `npx remotion studio src/index.ts`.

## Replace the voice or the music (no visual re-render)

1. Drop a new recording in as `audio/vo3.wav` (any sample rate, mono or stereo). Keep the line
   start times in `src/data/timeline.json` (`vo`) or adjust them there.
2. `python scripts/vo_timings.py` re-times the subtitles from the new audio.
3. Replace `audio/music.flac` (or add `audio/music.wav`, which wins) to swap the score;
   `python scripts/compose.py` regenerates the original.
4. `./scripts/build.sh` re-mixes (music ducked 8 dB under each line, -14 LUFS, true peak under -1 dBTP) and
   re-encodes. Only the subtitle overlays re-render; the 3D plates are reused.

Voice: Kokoro `hf_beta`, warm Indian-English female, "Vaanika" said VAA-ni-kaa
(`[Vaanika](/vˈɑnikˌɑ/)` in `scripts/tts.py`).
