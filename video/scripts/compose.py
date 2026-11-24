"""
Original score for the Vaanika film, composed and synthesised in code (no samples).
Raag Bhupali (S R G P D) on Sa = D, 80 BPM: tanpura drone, santoor-style plucks, soft strings,
a low pulse that builds, whooshes for the jet and the contrail, a bell on each logo petal and a
warm final chord. Event times come from src/data/timeline.json, the same file the visuals use.

Writes audio/music.flac (the bed the voiceover is mixed over) and audio/stems/*.flac.
Run: python scripts/compose.py   (numpy, scipy, soundfile)
"""
import json, os
import numpy as np, soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
TL = json.load(open(os.path.join(ROOT, 'src', 'data', 'timeline.json')))
EV = TL['events']
SR = 48000
DUR = TL['duration']
N = int(SR * DUR)
BEAT = TL['beat']
BAR = TL['bar']
RNG = np.random.default_rng(7)

DEG = {'S': 0, 'R': 2, 'G': 4, 'P': 7, 'D': 9}
def midi(m): return 440.0 * 2 ** ((m - 69) / 12)
def sw(deg, octv):  # swara -> midi, Sa = D4 (62) in octave 4
    return 62 + DEG[deg] + 12 * (octv - 4)
def tt(n): return np.arange(int(n * SR)) / SR


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, start, sig, pan=0.0, gain=1.0):
        i0 = int(round(start * SR))
        if sig.ndim == 1:
            a = (pan + 1) * np.pi / 4
            sig = np.stack([sig * np.cos(a), sig * np.sin(a)], 1) * np.sqrt(2)
        if i0 < 0:
            sig = sig[-i0:]; i0 = 0
        n = min(len(sig), N - i0)
        if n > 0:
            self.x[i0:i0 + n] += sig[:n] * gain


# ---------------------------------------------------------------- instruments
def tanpura(f0, dur=6.5, seed=0):
    t = tt(dur); r = np.random.default_rng(seed)
    out = np.zeros_like(t)
    c = 2.5 + 15 * (1 - np.exp(-t / 0.7)) - 4 * np.clip((t - 1.8) / 4, 0, 1)   # jawari sweep
    for k in range(1, 48):
        fk = f0 * k * (1 + 0.00006 * k * k)
        if fk > 9000: break
        form = 1 + 3.0 * np.exp(-((k - c) ** 2) / (2 * 2.6 ** 2))
        env = np.exp(-t / (5.0 / (1 + 0.035 * k)))
        out += k ** -0.85 * form * env * np.sin(2 * np.pi * fk * (1 + r.normal(0, 1.2e-4)) * t + r.uniform(0, 6.28))
    return out * (1 - np.exp(-t / 0.006)) / 6


def santoor(f0, vel=1.0, dur=3.2, seed=0):
    t = tt(dur); r = np.random.default_rng(seed)
    out = np.zeros_like(t)
    for cents in (-3.0, 0.0, 2.6):
        f = f0 * 2 ** (cents / 1200)
        for k in range(1, 22):
            fk = f * k * np.sqrt(1 + 0.00025 * k * k)
            if fk > 15000: break
            a = abs(np.sin(np.pi * k * 0.137)) / k ** 0.8
            env = np.exp(-t * (0.9 + 0.42 * k) * (f0 / 440) ** 0.35)
            out += a * env * np.sin(2 * np.pi * fk * t + r.uniform(0, 6.28))
    ham = r.normal(0, 1, len(t)) * np.exp(-t / 0.0035)
    ham = signal.sosfilt(signal.butter(2, [1800, 7000], 'bp', fs=SR, output='sos'), ham)
    out = out / 3 + 0.25 * ham
    return out * (1 - np.exp(-t / 0.0012)) * vel / 3


def roll(f0, start, length, bus, pan, vel=0.6, rate=0.09375, seed=0):
    """Santoor tremolo: fast alternating strikes, swelling then fading."""
    n = int(length / rate)
    for i in range(n):
        x = i / max(n - 1, 1)
        v = vel * (0.55 + 0.45 * np.sin(np.pi * x)) * (0.85 if i % 2 else 1.0)
        bus.add(start + i * rate + RNG.normal(0, 0.004), santoor(f0, v, 1.6, seed + i), pan)


def pad(notes, dur, att=1.4, rel=2.0, cutoff=1800, seed=0, bright_end=None):
    t = tt(dur + rel); r = np.random.default_rng(seed)
    L = np.zeros_like(t); R = np.zeros_like(t)
    for m in notes:
        f = midi(m)
        for v in range(6):
            det = 2 ** (r.uniform(-8, 8) / 1200)
            vib = 1 + 0.0018 * np.sin(2 * np.pi * r.uniform(4.5, 5.6) * t + r.uniform(0, 6.28))
            ph = 2 * np.pi * np.cumsum(f * det * vib) / SR
            s = np.zeros_like(t)
            for k in range(1, 24):
                if f * k > 7000: break
                s += np.sin(k * ph + r.uniform(0, 6.28)) / k
            p = r.uniform(-0.8, 0.8)
            L += s * np.cos((p + 1) * np.pi / 4); R += s * np.sin((p + 1) * np.pi / 4)
    env = np.minimum(1, t / att) ** 1.6
    env *= np.where(t > dur, np.exp(-(t - dur) / (rel / 4)), 1)
    out = np.stack([L, R], 1) * env[:, None]
    if bright_end:   # filter opening over the chord (for builds)
        lo = signal.sosfilt(signal.butter(2, cutoff, 'lp', fs=SR, output='sos'), out, axis=0)
        hi = signal.sosfilt(signal.butter(2, bright_end, 'lp', fs=SR, output='sos'), out, axis=0)
        k = np.clip(t / dur, 0, 1)[:, None] ** 2
        out = lo * (1 - k) + hi * k
    else:
        out = signal.sosfilt(signal.butter(2, cutoff, 'lp', fs=SR, output='sos'), out, axis=0)
    return out / (len(notes) * 6) * 2.2


def pulse(vel=1.0):
    t = tt(0.9)
    f = 36 + 40 * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.28)
    click = RNG.normal(0, 1, len(t)) * np.exp(-t / 0.002) * 0.15
    click = signal.sosfilt(signal.butter(2, 2500, 'lp', fs=SR, output='sos'), click)
    return (s + click) * vel


def drum(vel=1.0, f_hi=110, f_lo=52, dec=0.7):
    t = tt(2.0)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.06)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / dec)
    slap = signal.sosfilt(signal.butter(2, [150, 1200], 'bp', fs=SR, output='sos'), RNG.normal(0, 1, len(t))) * np.exp(-t / 0.03)
    return (body + 0.5 * slap) * vel


def bell(f0, vel=1.0, dur=5.0, seed=0):
    t = tt(dur); r = np.random.default_rng(seed)
    parts = [(0.5, 0.22, 4.0), (1.0, 1.0, 3.4), (1.0016, 0.5, 3.3), (1.19, 0.28, 2.2), (1.5, 0.3, 2.0), (2.0, 0.5, 1.6), (2.5, 0.2, 1.1), (3.0, 0.14, 0.9), (4.07, 0.1, 0.6), (5.4, 0.05, 0.35)]
    out = np.zeros_like(t)
    for ratio, a, dec in parts:
        out += a * np.exp(-t / dec) * np.sin(2 * np.pi * f0 * ratio * t + r.uniform(0, 6.28))
    strike = signal.sosfilt(signal.butter(2, 4000, 'hp', fs=SR, output='sos'), r.normal(0, 1, len(t))) * np.exp(-t / 0.002) * 0.2
    return (out + strike) * (1 - np.exp(-t / 0.0015)) * vel / 2.5


def shaped_noise(dur, centers, widths, env, seed=0, nper=2048):
    """Noise with a time-varying spectral band (STFT shaping). centers/widths: functions of x in [0,1]."""
    r = np.random.default_rng(seed)
    x = r.normal(0, 1, int(dur * SR))
    f, tm, Z = signal.stft(x, SR, nperseg=nper)
    xs = tm / dur
    C = np.array([centers(v) for v in xs]); W = np.array([widths(v) for v in xs])
    mask = np.exp(-((np.log(f[:, None] + 1) - np.log(C[None, :])) ** 2) / (2 * W[None, :] ** 2))
    _, y = signal.istft(Z * mask, SR, nperseg=nper)
    y = y[:len(x)]
    e = np.array([env(v) for v in np.linspace(0, 1, len(y))])
    return y * e / (np.std(y) + 1e-9)


def whoosh(dur, f0, f1, peak=0.6, seed=0, width=0.5):
    env = lambda x: (x / peak) ** 2.2 if x < peak else np.exp(-(x - peak) / (1 - peak) * 4.5)
    return shaped_noise(dur, lambda x: f0 * (f1 / f0) ** x, lambda x: width, env, seed)


def autopan(sig, p0, p1):
    k = np.linspace(0, 1, len(sig)); p = p0 + (p1 - p0) * (3 * k * k - 2 * k ** 3)
    a = (p + 1) * np.pi / 4
    return np.stack([sig * np.cos(a), sig * np.sin(a)], 1) * np.sqrt(2)


def shimmer(dur, f_lo, f_hi, density=40, seed=0):
    r = np.random.default_rng(seed)
    out = np.zeros(int(dur * SR))
    for _ in range(int(density * dur)):
        st = r.uniform(0, dur - 0.3); x = st / dur
        f = f_lo * (f_hi / f_lo) ** (x + r.uniform(-0.1, 0.1))
        t = tt(0.6)
        ping = np.sin(2 * np.pi * f * t) * np.exp(-t / r.uniform(0.05, 0.25)) * r.uniform(0.3, 1)
        i0 = int(st * SR); n = min(len(ping), len(out) - i0)
        out[i0:i0 + n] += ping[:n]
    return out / 6


def reverb_ir(sec=3.0, seed=3):
    r = np.random.default_rng(seed)
    t = tt(sec)
    ir = np.zeros((len(t), 2))
    for ch in range(2):
        n = r.normal(0, 1, len(t)) * np.exp(-t * 6.9 / sec)
        b1 = signal.sosfilt(signal.butter(2, 7000, 'lp', fs=SR, output='sos'), n)
        b2 = signal.sosfilt(signal.butter(2, 2200, 'lp', fs=SR, output='sos'), n)
        k = np.clip(t / sec, 0, 1)
        ir[:, ch] = b1 * (1 - k) + b2 * k
        for d in r.uniform(0.008, 0.07, 9):
            ir[int(d * SR), ch] += r.uniform(-0.6, 0.6)
    pre = int(0.022 * SR)
    ir = np.concatenate([np.zeros((pre, 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def lufs_like(x):
    # K-weighting approximation (high-shelf + high-pass) for level matching between stems
    sos = np.vstack([signal.butter(2, 60, 'hp', fs=SR, output='sos'), signal.butter(1, 2000, 'hp', fs=SR, output='sos')])
    y = signal.sosfilt(sos, x, axis=0) * 0.5 + x * 0.5
    return 10 * np.log10(np.mean(y ** 2) + 1e-12) - 0.691


# ---------------------------------------------------------------- arrangement
drone, sant, strings, perc, sfx, bells = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()

# Tanpura: Pa - Sa' - Sa' - Sa, one pluck per beat, whole film, fading in and out
pattern = [(45, -0.35), (50, 0.2), (50, 0.35), (38, -0.15)]
nbeats = int(DUR / BEAT)
for b in range(nbeats):
    m, p = pattern[b % 4]
    tb = b * BEAT + RNG.normal(0, 0.01)
    g = min(1, (tb + 0.4) / 2.5) * (0.55 if 24.0 <= tb < 27.0 else 1.0)
    drone.add(tb, tanpura(midi(m), seed=b), p, g)

# Strings: one chord per bar (pentatonic voicings), the bar 8 build opens the filter
chords = [
    ([50, 57, 59, 66], 1300), ([47, 54, 57, 62], 1400), ([52, 59, 62, 69], 1600), ([45, 52, 59, 64, 69], 1900),
    ([42, 50, 57, 66], 1700), ([47, 54, 59, 62, 64], 2000), ([50, 57, 64, 66, 71], 1900), ([52, 59, 62, 66, 69], 2100),
]
for i, (notes, cut) in enumerate(chords):
    g = [0.55, 0.6, 0.75, 0.9, 0.85, 1.0, 0.95, 1.0][i]
    strings.add(i * BAR, pad(notes, BAR, att=1.2 if i else 2.4, rel=1.6, cutoff=cut, seed=i), 0, g)
# bar 8 (24-27): build that opens, then cuts for a breath before the logo
b8 = pad([45, 52, 57, 59, 64, 69, 71], 2.55, att=1.8, rel=0.25, cutoff=1400, seed=8, bright_end=6000)
strings.add(24.0, b8, 0, 1.15)
# logo: soft D add9, then the warm final chord on the downbeat of bar 11
strings.add(27.0, pad([50, 57, 64, 66, 69], 6.0, att=1.5, rel=1.5, cutoff=2200, seed=9), 0, 0.75)
strings.add(EV['finalChord'], pad([38, 45, 50, 54, 57, 59, 64, 66, 69], DUR - EV['finalChord'] - 0.6, att=0.35, rel=2.2, cutoff=2600, seed=11), 0, 1.25)

# Santoor phrases (beats from the section start), Bhupali movements
def phrase(t0, notes, pan=0.0, vel=0.8, seed=0):
    for i, (b, deg, octv, v) in enumerate(notes):
        sant.add(t0 + b * BEAT, santoor(midi(sw(deg, octv)), v * vel, 3.2, seed + i), pan + RNG.uniform(-0.15, 0.15))

# 0-6 s: sparse opening, then the rising pakad into the 6.0 s cut
phrase(0.2, [(0, 'G', 4, .55), (1, 'R', 4, .45), (2, 'S', 4, .5)], -0.2, seed=10)
phrase(3.4, [(0, 'D', 3, .5), (0.5, 'S', 4, .55), (1, 'R', 4, .6), (1.5, 'G', 4, .7), (2.0, 'P', 4, .75), (2.5, 'D', 4, .8), (2.875, 'S', 5, .9)], 0.15, seed=20)
# 6-12 s: motif on the cut, quiet under the voice, fill into 12.0
phrase(6.0, [(0, 'G', 5, .9), (0.5, 'R', 5, .6), (1.0, 'S', 5, .65), (1.5, 'D', 4, .55)], -0.1, 0.8, 30)
roll(midi(sw('S', 5)), 8.7, 0.9, sant, 0.2, 0.32, seed=40)
phrase(11.0, [(0, 'P', 4, .6), (0.333, 'D', 4, .65), (0.667, 'S', 5, .75), (1.0, 'R', 5, .8)], 0.1, 0.85, 50)
# 12-18 s: helicopter
phrase(12.0, [(0, 'G', 5, .95), (0.5, 'P', 5, .7), (1.0, 'G', 5, .6), (1.25, 'R', 5, .55), (1.5, 'S', 5, .6)], 0.0, 0.8, 60)
roll(midi(sw('G', 5)), 14.6, 0.5, sant, -0.2, 0.3, seed=70)
phrase(16.5, [(0, 'S', 5, .85), (0.5, 'D', 4, .6), (1.0, 'P', 4, .6), (1.5, 'G', 4, .65)], 0.1, 0.85, 80)
# 18-24 s: one rising note on each card (Sa Re Ga Pa) + a soft echo an octave down
for i, (tc, deg) in enumerate(zip(EV['cards'], ['S', 'R', 'G', 'P'])):
    sant.add(tc, santoor(midi(sw(deg, 5)), 0.9, 3.4, 90 + i), [-0.45, -0.15, 0.15, 0.45][i])
    sant.add(tc + BEAT, santoor(midi(sw(deg, 4)), 0.35, 3.0, 95 + i), [-0.45, -0.15, 0.15, 0.45][i] * 0.5)
# 24-26.6 s: the build, a quickening roll
roll(midi(sw('P', 5)), 24.0, 1.5, sant, 0.2, 0.42, rate=0.1875, seed=100)
roll(midi(sw('S', 6)), 25.5, 1.05, sant, -0.2, 0.5, rate=0.09375, seed=120)
# logo: gentle closing phrase after the bells, under the voice
phrase(30.0, [(0, 'G', 5, .5), (1.0, 'R', 5, .4), (2.0, 'S', 5, .45)], 0.1, 0.7, 140)
phrase(EV['finalChord'], [(0, 'S', 5, .8), (0.333, 'P', 4, .5), (0.667, 'G', 4, .45), (1.0, 'D', 4, .4), (2.0, 'S', 4, .5)], 0.0, 0.8, 150)
roll(midi(sw('S', 6)), EV['finalChord'] + 0.02, 1.6, sant, 0.25, 0.22, seed=160)

# Pulse: starts with the jet, builds through the cards, breath before the logo
for b in range(int(6.0 / BEAT), int(26.25 / BEAT)):
    tb = b * BEAT
    beat_in_bar = b % 4
    if tb < 12.0:
        if beat_in_bar in (0, 2): perc.add(tb, pulse(0.55 + 0.25 * (tb - 6) / 6))
    elif tb < 24.0:
        perc.add(tb, pulse(0.8 if beat_in_bar == 0 else 0.6))
        if tb >= 18.0: perc.add(tb + BEAT / 2, pulse(0.25))
    else:
        perc.add(tb, pulse(0.9))
        perc.add(tb + BEAT / 2, pulse(0.45))
        if tb >= 25.5:
            perc.add(tb + BEAT / 4, pulse(0.3)); perc.add(tb + 3 * BEAT / 4, pulse(0.35))
# downbeat drums on the cuts and the big moments
for tc, v in [(6.0, 0.9), (EV['jetLiftoff'], 0.6), (12.0, 0.9), (EV['heliTouchdown'], 0.75), (18.0, 0.85), (27.0, 1.0)]:
    perc.add(tc, drum(v), 0)
perc.add(EV['finalChord'], drum(0.8, 90, 40, 1.4), 0)

# SFX
# cloud flash riser into the 6.0 cut
sfx.add(4.6, autopan(whoosh(1.45, 300, 5000, 0.96, seed=1, width=0.6), -0.3, 0.3), 0, 0.35)
# jet: engine roll building, the lift-off whoosh passing left to right, a fading roar into the sky
eng = shaped_noise(6.0, lambda x: 180 + 500 * x, lambda x: 0.7, lambda x: min(1, x * 3) * (1 - 0.6 * max(0, x - 0.55) / 0.45), seed=5)
t6 = tt(6.0)
whine = np.sin(2 * np.pi * np.cumsum(2800 + 900 * np.clip(t6 / 3, 0, 1)) / SR) * 0.06 * np.minimum(1, t6 / 2) * np.exp(-np.maximum(0, t6 - 3.5) / 1.2)
sfx.add(6.0, autopan(eng * 0.5 + whine, -0.6, 0.6), 0, 0.42)
sfx.add(EV['jetLiftoff'] - 1.0, autopan(whoosh(2.6, 200, 2600, 0.42, seed=2, width=0.55), -0.8, 0.8), 0, 0.7)
# helicopter: soft rotor thrum, closer as it descends
th = tt(6.0)
blade = (0.5 + 0.5 * np.cos(2 * np.pi * 20.5 * th)) ** 6
rot = signal.sosfilt(signal.butter(2, 380, 'lp', fs=SR, output='sos'), RNG.normal(0, 1, len(th))) * blade
rot = rot / np.std(rot) * np.minimum(1, 0.2 + th / 4.5) * np.where(th > 5.3, np.exp(-(th - 5.3) / 0.25), 1)
sfx.add(12.0, rot, 0.1, 0.16)
sfx.add(15.6, autopan(whoosh(2.0, 600, 3000, 0.5, seed=3, width=0.7), 0.3, -0.3), 0, 0.22)   # petal gust
sfx.add(15.8, shimmer(2.0, 2500, 6000, 30, seed=4), 0.0, 0.35)
# contrail: bright swoosh left to right, with sparkle trailing
sfx.add(EV['contrailSweep'] - 0.25, autopan(whoosh(1.7, 350, 6500, 0.5, seed=6, width=0.45), -0.9, 0.9), 0, 0.85)
sfx.add(EV['contrailSweep'] + 0.3, autopan(shimmer(1.3, 3000, 9000, 45, seed=7), -0.5, 0.8), 0, 0.5)
# reverse swell into the logo downbeat
rev = whoosh(1.2, 800, 9000, 0.98, seed=8, width=0.8)
sfx.add(25.8, rev, 0, 0.3)
# bells on each petal (Sa Re Ga Pa Sa'), sparkle on the crescent
for i, (k, deg, o) in enumerate([('petalIvory', 'S', 5), ('petalGold', 'R', 5), ('petalBlue', 'G', 5), ('crescent', 'P', 5), ('arc', 'S', 6)]):
    bells.add(EV[k], bell(midi(sw(deg, o)), 0.85 if i < 4 else 0.7, seed=200 + i), [-0.35, 0.0, 0.35, 0.0, 0.0][i])
bells.add(EV['crescent'] + 0.25, autopan(shimmer(0.9, 4000, 11000, 60, seed=9), -0.3, 0.3), 0, 0.55)
# soft cymbal swell into the final chord
sfx.add(EV['finalChord'] - 1.6, whoosh(1.62, 3000, 9000, 0.99, seed=10, width=0.9), 0, 0.22)

# ---------------------------------------------------------------- mix
stems = {'drone': (drone, -27), 'strings': (strings, -26), 'santoor': (sant, -23.5), 'pulse': (perc, -24),
         'sfx': (sfx, -26), 'bells': (bells, -23)}
out = np.zeros((N, 2))
send = np.zeros((N, 2))
os.makedirs(os.path.join(ROOT, 'audio', 'stems'), exist_ok=True)
sends = {'drone': 0.25, 'strings': 0.35, 'santoor': 0.45, 'pulse': 0.12, 'sfx': 0.25, 'bells': 0.55}
for name, (bus, target) in stems.items():
    x = bus.x
    if name in ('drone', 'strings'):   # keep the low end for the pulse; clear room for the voice
        x = signal.sosfilt(signal.butter(2, 70 if name == 'drone' else 90, 'hp', fs=SR, output='sos'), x, axis=0)
    act = x[np.abs(x).max(1) > 1e-4]
    lvl = lufs_like(act) if len(act) else -99
    g = 10 ** ((target - lvl) / 20)
    x = x * g
    sf.write(os.path.join(ROOT, 'audio', 'stems', f'{name}.flac'), np.clip(x, -1, 1).astype(np.float32), SR, subtype='PCM_24')
    out += x
    send += x * sends[name]
    print(f'{name:8s} level {lvl:6.1f} -> {target} dB')
ir = reverb_ir(3.2)
wet = np.stack([signal.fftconvolve(send[:, 0], ir[:, 0])[:N], signal.fftconvolve(send[:, 1], ir[:, 1])[:N]], 1)
out = out + wet * 0.55
# gentle master: low-end tidy, glue, fade the tail to silence at the end
out = signal.sosfilt(signal.butter(2, 28, 'hp', fs=SR, output='sos'), out, axis=0)
t = np.arange(N) / SR
# macro dynamics: intimate opening, build through the jet and the cards, peak at the contrail and
# the bloom, warm resolve on the final chord (dB keyframes)
keys = [(0, -4.5), (5.5, -3.5), (6.0, -3), (12.0, -2), (18.0, -2), (24.0, -1), (26.4, 1.5), (26.8, -2), (27.0, 0.5),
        (29.0, -1.5), (32.8, -2), (33.0, 0.5), (DUR, 0)]
kt, kv = zip(*keys)
out *= (10 ** (np.interp(t, kt, kv) / 20))[:, None]
out *= np.where(t > DUR - 2.6, np.cos(np.clip((t - (DUR - 2.6)) / 2.6, 0, 1) * np.pi / 2) ** 1.5, 1)[:, None]
out *= np.minimum(1, t / 0.05)[:, None]
peak = np.abs(out).max()
out *= 0.5 / peak
sf.write(os.path.join(ROOT, 'audio', 'music.flac'), out.astype(np.float32), SR, subtype='PCM_24')
print('music.flac written, peak normalised to -6 dBFS; duration', DUR)
