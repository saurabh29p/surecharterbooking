"""
Final mix: music bed + the five voiceover lines, ducking the music ~8 dB under each line.
Swap any audio/voN.wav (or audio/music.flac) and re-run; the visuals never need re-rendering.
Writes audio/mix.wav (48 kHz, 24-bit), mastered to -14 LUFS integrated, true peak <= -1 dBTP (limited at -1.6 dBTP for the AAC encodes).
"""
import json, os
import numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
A = lambda *p: os.path.join(ROOT, 'audio', *p)
TL = json.load(open(os.path.join(ROOT, 'src', 'data', 'timeline.json')))
SR = 48000
N = int(TL['duration'] * SR)
DUCK_DB = -8.0
VO_GAIN_DB = 3.0
TARGET_LUFS = -14.0
CEILING_DBTP = -1.6  # leaves headroom so AAC encodes stay at or below -1 dBTP


def load(path, mono=False):
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        x = signal.resample_poly(x, SR, sr, axis=0)
    if mono:
        return x.mean(1)
    return x if x.shape[1] == 2 else np.repeat(x, 2, 1)


music_path = A('music.wav') if os.path.exists(A('music.wav')) else A('music.flac')
music = load(music_path)[:N]
music = np.pad(music, ((0, N - len(music)), (0, 0)))

# voice bus: gentle compression, small plate-like reverb, placed at the timeline times
vo = np.zeros((N, 2))
duck = np.zeros(N)
ir_t = np.arange(int(1.1 * SR)) / SR
rng = np.random.default_rng(1)
plate = np.stack([rng.normal(0, 1, len(ir_t)) * np.exp(-ir_t * 6.9 / 1.1) for _ in range(2)], 1)
plate = signal.sosfilt(signal.butter(2, [300, 6000], 'bp', fs=SR, output='sos'), plate, axis=0)
plate /= np.sqrt((plate ** 2).sum() / 2)
spans = []
for name, start in TL['vo'].items():
    v = load(A(f'{name}.wav'), mono=True)
    # soft knee compressor (RMS, 4:1 above -24 dBFS)
    env = np.sqrt(signal.lfilter([1 - np.exp(-1 / (0.02 * SR))], [1, -np.exp(-1 / (0.02 * SR))], v ** 2) + 1e-12)
    lvl = 20 * np.log10(env)
    gr = np.where(lvl > -24, (lvl + 24) * (1 / 4 - 1), 0)
    v = v * 10 ** (gr / 20)
    i0 = int(start * SR); n = min(len(v), N - i0)
    dry = np.stack([v[:n], v[:n]], 1)
    wet = np.stack([signal.fftconvolve(v[:n], plate[:, c])[:n] for c in range(2)], 1)
    vo[i0:i0 + n] += dry + wet * 0.07
    spans.append((start, start + len(v) / SR))

# ducking envelope: -8 dB while a line plays, 0.15 s lead-in, 0.45 s release
t = np.arange(N) / SR
g = np.zeros(N)
for a, b in spans:
    g = np.maximum(g, np.clip((t - (a - 0.15)) / 0.15, 0, 1) * np.clip(((b + 0.45) - t) / 0.45, 0, 1))
g = signal.filtfilt(*signal.butter(1, 6, fs=SR), g)
gain = 10 ** (DUCK_DB * np.clip(g, 0, 1) / 20)

mix = music * gain[:, None] + vo * 10 ** (VO_GAIN_DB / 20)

# master: loudness to target, then a look-ahead true-peak limiter
meter = pyln.Meter(SR)
mix *= 10 ** ((TARGET_LUFS - meter.integrated_loudness(mix)) / 20)
ceil = 10 ** (CEILING_DBTP / 20) * 0.98
for _ in range(3):
    os4 = np.abs(signal.resample_poly(mix, 4, 1, axis=0)).max(1).reshape(-1, 4).max(1)[:N]
    need = np.minimum(1, ceil / np.maximum(os4, 1e-9))
    la = int(0.005 * SR)
    need = np.minimum.accumulate(np.concatenate([need[la:], np.ones(la)])[::-1])[::-1] if False else need
    # min over a 5 ms window (look-ahead), then smooth release
    from scipy.ndimage import minimum_filter1d
    need = minimum_filter1d(need, size=2 * la + 1)
    rel = signal.lfilter([1 - np.exp(-1 / (0.08 * SR))], [1, -np.exp(-1 / (0.08 * SR))], 1 - need)
    att = np.maximum(1 - need, rel)
    mix *= (1 - att)[:, None]
lufs = meter.integrated_loudness(mix)
tp = 20 * np.log10(np.abs(signal.resample_poly(mix, 4, 1, axis=0)).max())
sf.write(A('mix.wav'), mix.astype(np.float32), SR, subtype='PCM_24')
print(f'mix.wav: {lufs:.1f} LUFS integrated, true peak {tp:.2f} dBTP, ducking {DUCK_DB} dB under {len(spans)} lines')
music_under = [20 * np.log10(np.sqrt(np.mean((music[int(a * SR):int(b * SR)] * gain[int(a * SR):int(b * SR), None]) ** 2)) + 1e-12) for a, b in spans]
vo_lv = [20 * np.log10(np.sqrt(np.mean(vo[int(a * SR):int(b * SR)] ** 2)) + 1e-12) + VO_GAIN_DB for a, b in spans]
for (a, b), m, v in zip(spans, music_under, vo_lv):
    print(f'  line {a:5.2f}-{b:5.2f}s  voice {v:6.1f} dB RMS  music under it {m:6.1f} dB  (voice {v - m:+.1f} dB above)')
