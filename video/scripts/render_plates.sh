#!/usr/bin/env bash
# Expensive WebGL renders (ProRes HQ, video only). ~25-30 min each on a 4-core CPU box.
set -e
cd "$(dirname "$0")/.."
for c in ${@:-FilmPlate HeroLoop ReelsPlate}; do
  node scripts/render.mjs "$c" "out/renders/$c.mov" --concurrency=1
done
