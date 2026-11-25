#!/usr/bin/env bash
# Expensive WebGL renders (ProRes, video only; the film plates are 90 fps for motion blur).
# Several hours each on a 4-core CPU box; CI splits them into parallel frame ranges instead.
set -e
cd "$(dirname "$0")/.."
for c in ${@:-FilmPlate HeroLoop ReelsPlate}; do
  node scripts/render.mjs "$c" "out/renders/$c.mov" --concurrency=2 --profile=standard --img=jpeg
done
