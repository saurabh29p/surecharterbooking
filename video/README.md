# video/ — the Vaanika brand film

A 38-second brand film made entirely in code: Remotion + Three.js (GLSL shaders) for the
picture, an original score synthesised in Python, and a Kokoro text-to-speech voiceover.
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

Large renders (`out/`) are git-ignored. Pushing a tag `film-v*` runs
`.github/workflows/film-release.yml`, which rebuilds everything from these sources and attaches
the files to a GitHub release.

## How it fits together

- `src/data/timeline.json` is the single source of timing: 80 BPM (one bar = 3 s = 90 frames),
  scene cuts on downbeats, every visual event and every voice line. The score
  (`scripts/compose.py`) reads the same file, so cuts, the jet lift-off, the helicopter
  touchdown, each card, the contrail and each logo petal land on the music.
- Scenes are in `src/scenes/` (S1 night sky, S2 jet, S3 helicopter, S4/S5 cards and contrail,
  S6 logo). Shared shader models are in `src/models/`; post-processing (HDR bloom, ACES, grade,
  grain) is in `src/lib/Stage.tsx`.
- Rendering is split in two layers: the **plate** (WebGL picture, slow: about 25 minutes per
  aspect ratio on a 4-core CPU) and the **overlay** (headlines, subtitles, end card; seconds).
  `scripts/build.sh` composites them with ffmpeg and adds the audio mix.

## Rebuild

```bash
cd video
npm ci
node scripts/sync-logo.mjs          # copy + parse the logo files from design/logo/svg
./scripts/render_plates.sh          # FilmPlate, HeroLoop, ReelsPlate -> out/renders (slow)
./scripts/build.sh                  # overlays, mix, encodes, checks -> out/release and web/
```

Python 3.10–3.12 with `numpy scipy soundfile pyloudnorm` is needed for the mix; `kokoro` and
`faster-whisper` only if you regenerate the voice or the subtitle timings.

Preview in the browser: `npx remotion studio src/index.ts`.

## Replace the voice or the music (no visual re-render)

1. Drop a new recording in as `audio/vo3.wav` (any sample rate, mono or stereo). Keep the line
   start times in `src/data/timeline.json` (`vo`) or adjust them there.
2. `python scripts/vo_timings.py` re-times the subtitles from the new audio.
3. Replace `audio/music.flac` (or add `audio/music.wav`, which wins) to swap the score;
   `python scripts/compose.py` regenerates the original.
4. `./scripts/build.sh` re-mixes (music ducked 8 dB under each line, -16 LUFS, -1 dBTP) and
   re-encodes. Only the subtitle overlays re-render; the 3D plates are reused.

Voice: Kokoro `hf_beta`, warm Indian-English female, "Vaanika" said VAA-ni-kaa
(`[Vaanika](/vˈɑnikˌɑ/)` in `scripts/tts.py`).
