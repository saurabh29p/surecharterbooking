# Verifies the deliverables: sizes, dimensions, durations, audio loudness/peaks, hero loop seam.
import json, os, subprocess
import numpy as np

D, W = 'out/release', 'web'
def probe(p):
    j = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,width,height,color_space', '-of', 'json', p]))
    v = next(s for s in j['streams'] if s['codec_type'] == 'video')
    a = any(s['codec_type'] == 'audio' for s in j['streams'])
    return float(j['format']['duration']), int(j['format']['size']), v['width'], v['height'], a, v.get('color_space')
rules = {
    f'{D}/vaanika-film-master-1080p.mp4': (1920, 1080, True, None),
    f'{D}/vaanika-film-subtitled-1080p.mp4': (1920, 1080, True, None),
    f'{D}/vaanika-film-reels-1080x1920.mp4': (1080, 1920, True, None),
    f'{W}/vaanika-film-720p.mp4': (1280, 720, True, 3_000_000),
    f'{W}/hero-loop-720p.mp4': (1280, 720, False, 2_500_000),
}
ok = True
for p, (w, h, audio, cap) in rules.items():
    dur, size, vw, vh, a, cs = probe(p)
    good = (vw, vh) == (w, h) and a == audio and (cap is None or size <= cap) and (not audio or 32 <= dur <= 35.1)
    ok &= good
    print(f"{'OK ' if good else 'BAD'} {p}: {vw}x{vh} {dur:.2f}s {size/1e6:.2f} MB audio={a} matrix={cs}")
def loudness(p):
    out = subprocess.run(['ffmpeg', '-v', 'info', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    tail = out[out.rfind('Summary:'):]
    I = float(tail.split('I:')[1].split('LUFS')[0]); P = float(tail.split('Peak:')[1].split('dBFS')[0])
    return I, P
for p in [f'{D}/vaanika-film-master-1080p.mp4', f'{D}/vaanika-film-subtitled-1080p.mp4', f'{D}/vaanika-film-reels-1080x1920.mp4', f'{W}/vaanika-film-720p.mp4']:
    I, P = loudness(p)
    good = abs(I + 14) <= 1.0 and P <= -1.0
    ok &= good
    print(f"{'OK ' if good else 'BAD'} {p}: {I:.1f} LUFS (target -14), true peak {P:.1f} dBTP (max -1)")
# hero seam: difference last->first frame vs typical consecutive-frame difference
def frames(p):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', p, '-vf', 'scale=320:180', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'])
    return np.frombuffer(raw, np.uint8).reshape(-1, 180, 320).astype(float)
f = frames(f'{W}/hero-loop-720p.mp4')
steps = np.abs(np.diff(f, axis=0)).mean((1, 2))
seam = np.abs(f[-1] - f[0]).mean()
ok &= seam < 1.0
print(f'   hero loop: {len(f)} frames, seam (last->first) {seam:.2f} mean luma diff; normal steps median {np.median(steps):.2f}, keyframe steps up to {steps.max():.2f}; {"invisible" if seam < 1.0 else "VISIBLE JUMP"} (< 1.0)')
left = f[:, :, :107].mean(); right = f[:, :, 107:].mean()
print(f'   hero loop: left third mean luma {left:.1f} vs rest {right:.1f}')
print('ALL OK' if ok else 'SOME CHECKS FAILED')
