#!/usr/bin/env bash
# The website's background film: the film's first three scenes (lake palace -> jet -> helicopter)
# with no text, as a seamless muted loop, in 16:9 for desktop and 9:16 for phones, plus posters.
#
# Inputs: the 90 fps plates (FilmPlate / ReelsPlate, whole or as CI chunks named <Comp>-<start>.mov)
# in $PLATES, and the text-free overlays (only the gold light-wipe edges):
#   node scripts/render.mjs FilmCleanOverlay  out/bg/FilmCleanOverlay.mov  --profile=4444 --alpha=1 --frames=0-440
#   node scripts/render.mjs ReelsCleanOverlay out/bg/ReelsCleanOverlay.mov --profile=4444 --alpha=1 --frames=0-440
# Output: web/hero-film-1280x720.mp4, web/hero-film-720x1280.mp4 (each <= 2.5 MB; H.264 High@4.0 so
# every phone's hardware decoder takes them) and posters.
set -euo pipefail
cd "$(dirname "$0")/.."
PLATES=${PLATES:-out/renders/chunks}
B=out/bg; W=web
mkdir -p "$B" "$W"
TAG709=(-colorspace bt709 -color_primaries bt709 -color_trc bt709)
# loop: play 2.1 s -> 14.6 s (the cut is before the cards scene), and cross-fade its last 1.5 s
# into 0.6 s -> 2.1 s, so the last frame meets the first (12.5 s period)
S0=0.6; S1=2.1; END=14.6; XF=1.5
OFF=$(python3 -c "print(round($END - $S1 - $XF, 3))")

build() { # comp overlay out_name width height kbps
  local comp=$1 ov=$2 name=$3 w=$4 h=$5 kb=$6
  local plate=$B/$comp-90.mov clean=$B/$comp-clean.mov
  if [ ! -f "$plate" ]; then
    for f in $(ls "$PLATES"/$comp-*.mov | sort); do echo "file '$(realpath "$f")'"; done > "$B/$comp-list.txt"
    ffmpeg -y -v error -f concat -safe 0 -i "$B/$comp-list.txt" -c copy "$plate"
  fi
  # 90 -> 30 fps with motion blur (1-2-1 over the three sub-frames), then the overlay, in RGB
  ffmpeg -y -v error -i "$plate" -i "$ov" -filter_complex \
    "[0:v]tmix=frames=3:weights='1 2 1',select='eq(mod(n\,3)\,1)',setpts=N/(30*TB),scale=in_color_matrix=bt709:in_range=tv,format=gbrp[p];[1:v]scale=in_color_matrix=bt709:in_range=tv,format=gbrap[o];[p][o]overlay=0:0:format=gbrp:shortest=1,trim=0:$END,setpts=PTS-STARTPTS,scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le[v]" \
    -map "[v]" -r 30 -c:v prores_ks -profile:v 3 "$clean"
  local F="[0:v]trim=start=$S1:end=$END,setpts=PTS-STARTPTS[m];[0:v]trim=start=$S0:end=$S1,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$XF:offset=$OFF,scale=in_color_matrix=bt709:out_color_matrix=bt709,hqdn3d=1.4:1.4:3:3,scale=$w:$h:flags=lanczos,format=yuv420p[v]"
  local out=$W/$name.mp4
  for k in $kb $((kb * 9 / 10)) $((kb * 8 / 10)) $((kb * 7 / 10)); do
    ffmpeg -y -v error -i "$clean" -filter_complex "$F" -map "[v]" -c:v libx264 -profile:v high -level:v 4.0 -preset veryslow -tune film -b:v ${k}k -maxrate $((k * 2))k -bufsize $((k * 3))k -x264-params aq-mode=3 -pass 1 -passlogfile "$B/$name" -an -f null /dev/null
    ffmpeg -y -v error -i "$clean" -filter_complex "$F" -map "[v]" -c:v libx264 -profile:v high -level:v 4.0 -preset veryslow -tune film -b:v ${k}k -maxrate $((k * 2))k -bufsize $((k * 3))k -x264-params aq-mode=3 -pass 2 -passlogfile "$B/$name" -an "${TAG709[@]}" -movflags +faststart "$out"
    local size; size=$(stat -c %s "$out")
    echo "   $out  ${k} kbps -> $size bytes"
    [ "$size" -le 2500000 ] && break
  done
  # poster = the loop's first frame, full resolution
  ffmpeg -y -v error -ss $S1 -i "$clean" -frames:v 1 -vf "scale=in_color_matrix=bt709:in_range=tv,format=rgb24" "$B/$name-poster.png"
  ffmpeg -y -v error -i "$B/$name-poster.png" -q:v 3 "$W/$name-poster.jpg"
}

build FilmPlate  "$B/FilmCleanOverlay.mov"  hero-film-1280x720 1280 720  1500
build ReelsPlate "$B/ReelsCleanOverlay.mov" hero-film-720x1280 720  1280 1150
ls -la $W/hero-film-*
