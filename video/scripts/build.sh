#!/usr/bin/env bash
# Assemble every deliverable from the rendered plates (scripts/render_plates.sh or CI chunks), cheap overlay
# renders and the audio mix. Usage: scripts/build.sh   (needs node, ffmpeg, python3 + numpy scipy soundfile pyloudnorm)
set -euo pipefail
cd "$(dirname "$0")/.."
R=out/renders; D=out/release; W=web
mkdir -p "$R" "$D" "$W"
PY=${PYTHON:-python3}
TAG709=(-colorspace bt709 -color_primaries bt709 -color_trc bt709)
DUR=$(node -e "console.log(require('./src/data/timeline.json').duration)")
# STEPS selects parts to run (default: all), e.g. STEPS="web hero check" scripts/build.sh
STEPS=${STEPS:-"join mix overlays comp web hero thumb check"}
run() { [[ " $STEPS " == *" $1 "* ]]; }
COMPS=${COMPS:-"master subtitled reels"}

if run join; then
echo "== join plate chunks (CI renders each 90 fps plate in parallel frame ranges)"
for c in FilmPlate ReelsPlate HeroLoop; do
  ls $R/chunks/$c-*.mov >/dev/null 2>&1 || continue
  [ -f "$R/$c.mov" ] && continue
  for f in $(ls $R/chunks/$c-*.mov | sort); do echo "file '$(realpath "$f")'"; done > out/$c-chunks.txt
  ffmpeg -y -v error -f concat -safe 0 -i out/$c-chunks.txt -c copy "$R/$c.mov" && rm -f $R/chunks/$c-*.mov
  echo "   $R/$c.mov  $(du -h "$R/$c.mov" | cut -f1)"
done
fi

if run mix; then
echo "== audio mix"
$PY scripts/mix.py
fi

if run overlays; then
echo "== overlays (HTML only, transparent)"
for c in FilmOverlay FilmSubOverlay ReelsOverlay; do
  [ -f "$R/$c.mov" ] || node scripts/render.mjs "$c" "$R/$c.mov" --profile=4444 --alpha=1 --concurrency=2
done
fi

# composite plate + overlay in RGB (BT.709 in and out), add the mix
# 90 fps plates become 30 fps with motion blur: each output frame is the weighted mean of the three
# sub-frames centred on it (weights 1-2-1, about a 240-degree shutter)
blur() { # plate -> filter prefix
  local r; r=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$1")
  if [ "$r" = "90/1" ]; then echo "tmix=frames=3:weights='1 2 1',select='eq(mod(n\,3)\,1)',setpts=N/(30*TB),"; fi
}
comp() { # plate overlay out [encoder args...]
  local plate=$1 ov=$2 out=$3; shift 3
  ffmpeg -y -v error -i "$plate" -i "$ov" -i audio/mix.wav -filter_complex \
    "[0:v]$(blur "$plate")scale=in_color_matrix=bt709:in_range=tv,format=gbrp[p];[1:v]scale=in_color_matrix=bt709:in_range=tv,format=gbrap[o];[p][o]overlay=0:0:format=gbrp,scale=out_color_matrix=bt709:out_range=tv,format=yuv420p[v]" \
    -map "[v]" -map 2:a -r 30 -t "$DUR" "$@" "${TAG709[@]}" -movflags +faststart "$out"
  echo "   $out  $(du -h "$out" | cut -f1)"
}
if run comp; then
echo "== master, subtitled, reels"
if [[ " $COMPS " == *" master "* ]]; then comp $R/FilmPlate.mov $R/FilmOverlay.mov $D/vaanika-film-master-1080p.mp4 -c:v libx264 -preset slow -crf 14 -profile:v high -tune film -c:a aac -b:a 320k -ar 48000; fi
if [[ " $COMPS " == *" subtitled "* ]]; then comp $R/FilmPlate.mov $R/FilmSubOverlay.mov $D/vaanika-film-subtitled-1080p.mp4 -c:v libx264 -preset slow -crf 18 -profile:v high -tune film -c:a aac -b:a 256k -ar 48000; fi
if [[ " $COMPS " == *" reels "* ]]; then comp $R/ReelsPlate.mov $R/ReelsOverlay.mov $D/vaanika-film-reels-1080x1920.mp4 -c:v libx264 -preset slow -crf 18 -profile:v high -tune film -c:a aac -b:a 256k -ar 48000; fi
fi

if run web; then
echo "== web film 1280x720 <= 3 MB (two-pass)"
web() { # kbps
  ffmpeg -y -v error -i $D/vaanika-film-master-1080p.mp4 -vf "hqdn3d=1.2:1.2:5:5,scale=1280:720:flags=lanczos" -c:v libx264 -preset veryslow -tune film \
    -b:v ${1}k -maxrate $(( $1 * 2 ))k -bufsize $(( $1 * 4 ))k -x264-params aq-mode=3 -pass 1 -passlogfile out/web2pass -an -f null /dev/null
  ffmpeg -y -v error -i $D/vaanika-film-master-1080p.mp4 -vf "hqdn3d=1.2:1.2:5:5,scale=1280:720:flags=lanczos" -c:v libx264 -preset veryslow -tune film \
    -b:v ${1}k -maxrate $(( $1 * 2 ))k -bufsize $(( $1 * 4 ))k -x264-params aq-mode=3 -pass 2 -passlogfile out/web2pass \
    -c:a aac -b:a 96k -ac 2 -ar 48000 "${TAG709[@]}" -movflags +faststart $W/vaanika-film-720p.mp4
}
for kb in 520 490 460 430 400; do
  web $kb
  size=$(stat -c %s $W/vaanika-film-720p.mp4)
  echo "   video ${kb} kbps -> $size bytes"
  [ "$size" -le 3000000 ] && break
done
fi

if run hero; then
echo "== hero loop: 14 s seamless (tail crossfaded into head), 1280x720, no audio, <= 2.5 MB"
hero() { # kbps
  local F="[0:v]trim=start=14:end=16,setpts=PTS-STARTPTS[a];[0:v]trim=start=0:end=14,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=2:offset=0,scale=in_color_matrix=bt709:out_color_matrix=bt709,hqdn3d=1.6:1.6:0:0,scale=1280:720:flags=lanczos,format=yuv420p[v]"
  ffmpeg -y -v error -i $R/HeroLoop.mov -filter_complex "$F" -map "[v]" -c:v libx264 -preset veryslow -tune film -b:v ${1}k -maxrate $(( $1 * 2 ))k -bufsize $(( $1 * 3 ))k -x264-params aq-mode=3 -pass 1 -passlogfile out/hero2pass -an -f null /dev/null
  ffmpeg -y -v error -i $R/HeroLoop.mov -filter_complex "$F" -map "[v]" -c:v libx264 -preset veryslow -tune film -b:v ${1}k -maxrate $(( $1 * 2 ))k -bufsize $(( $1 * 3 ))k -x264-params aq-mode=3 -pass 2 -passlogfile out/hero2pass -an "${TAG709[@]}" -movflags +faststart $W/hero-loop-720p.mp4
}
for kb in 1350 1200 1050 900; do
  hero $kb
  size=$(stat -c %s $W/hero-loop-720p.mp4)
  echo "   ${kb} kbps -> $size bytes"
  [ "$size" -le 2500000 ] && break
done
# poster = the loop's first frame (so the site's poster -> video swap is seamless), 1920x1080
ffmpeg -y -v error -i $R/HeroLoop.mov -filter_complex "[0:v]trim=start=14:end=14.04,setpts=PTS-STARTPTS,scale=in_color_matrix=bt709:in_range=tv,format=rgb24[v]" -map "[v]" -frames:v 1 out/hero-poster.png
ffmpeg -y -v error -i out/hero-poster.png -q:v 4 $W/hero-poster.jpg
fi

if run thumb; then
echo "== thumbnail 1280x720"
node scripts/stills.mjs Thumbnail 0 out/thumb >/dev/null
ffmpeg -y -v error -i out/thumb_Thumbnail_0000.png -q:v 2 $W/vaanika-film-thumbnail.jpg
fi
cp $W/vaanika-film-720p.mp4 $W/hero-loop-720p.mp4 $W/hero-poster.jpg $W/vaanika-film-thumbnail.jpg $D/

if run check; then
echo "== checks"
$PY scripts/check_outputs.py
fi
