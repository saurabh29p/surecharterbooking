"""
Original score for the Vaanika film, composed and synthesised in code (no samples).
Raag Bhupali (S R G P D) on Sa = D, 96 BPM: tanpura drone, santoor-style plucks, soft strings and a
low pulse, shaped as an arc (an intimate opening, a build through the jet and the helicopter, a lift
on the cards, the peak on the logo bloom, then a resolve). Sound design: jet spool-up and roar with a
slow-motion drop and a doppler pass, rotor thump and downwash, petals, glass chimes on the cards,
a whoosh on each light wipe and the contrail, a bell on each logo petal. Event times come from
src/data/timeline.json, the same file the visuals use.

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


# ---------------------------------------------------------------- extra sound design
def doppler_tone(dur, f0, closest, speed=70.0, miss=12.0, c=343.0, harmonics=((1, 1.0), (2, 0.35), (3, 0.18))):
    """A source passing at `speed` m/s with closest approach `miss` m at time `closest`: pitch and level."""
    t = tt(dur)
    x = (t - closest) * speed
    r = np.sqrt(x ** 2 + miss ** 2)
    vr = speed * x / r                      # radial velocity (+ receding)
    f = f0 * c / (c + vr)
    out = np.zeros_like(t)
    for k, a in harmonics:
        out += a * np.sin(2 * np.pi * np.cumsum(f * k) / SR)
    return out * (miss / r) ** 1.1, f / f0, (miss / r) ** 1.1

def roar(dur, centre, width, env, seed=0):
    return shaped_noise(dur, centre, width, env, seed)

def thump(vel=1.0, f=70, dec=0.09):
    t = tt(0.25)
    fr = f * (1 + 0.6 * np.exp(-t / 0.01))
    body = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / dec)
    slap = signal.sosfilt(signal.butter(2, [200, 1500], 'bp', fs=SR, output='sos'), RNG.normal(0, 1, len(t))) * np.exp(-t / 0.012)
    return (body + 0.35 * slap) * vel

def glass(f0, vel=1.0, dur=3.0, seed=0):
    """Soft glass chime: inharmonic, bright, quick decay of the highs."""
    t = tt(dur); r = np.random.default_rng(seed)
    out = np.zeros_like(t)
    for ratio, a, dec in [(1.0, 1.0, 1.6), (2.76, 0.45, 0.9), (5.4, 0.25, 0.45), (8.93, 0.12, 0.25), (1.003, 0.6, 1.5)]:
        out += a * np.exp(-t / dec) * np.sin(2 * np.pi * f0 * ratio * t + r.uniform(0, 6.28))
    return out * (1 - np.exp(-t / 0.002)) * vel / 2.2

def rustle(dur, seed=0):
    r = np.random.default_rng(seed)
    n = signal.sosfilt(signal.butter(2, [2500, 9000], 'bp', fs=SR, output='sos'), r.normal(0, 1, int(dur * SR)))
    t = tt(dur)
    flutter = 0.4 + 0.6 * np.abs(np.sin(2 * np.pi * (7 + 3 * np.sin(2 * np.pi * 0.7 * t)) * t)) ** 3
    return n * flutter / np.std(n)


# ---------------------------------------------------------------- arrangement (96 BPM, cuts on the beat)
drone, sant, strings, perc, sfx, bells = Bus(), Bus(), Bus(), Bus(), Bus(), Bus()
SC = TL['scenes']
CUTS = [SC['jet'][0], SC['heli'][0], SC['cards'][0], SC['contrail'][0]]
LOGO = SC['logo'][0]

# Tanpura: Pa - Sa' - Sa' - Sa, one pluck per beat, softer in the breath before the bloom
pattern = [(45, -0.35), (50, 0.2), (50, 0.35), (38, -0.15)]
for b in range(int(DUR / BEAT)):
    m, p = pattern[b % 4]
    tb = b * BEAT + RNG.normal(0, 0.008)
    g = min(1, (tb + 0.3) / 3.0) * (0.5 if LOGO - 1.2 <= tb < LOGO else 1.0)
    drone.add(tb, tanpura(midi(m), seed=b), p, g)

# Strings: a chord per bar; the bar before the logo opens its filter (the build)
chords = [
    ([50, 57, 64, 66], 1000, 0.45), ([47, 54, 57, 62], 1100, 0.5),             # 0-5 lake palace: intimate
    ([43, 50, 57, 59, 64], 1400, 0.65), ([45, 52, 57, 59, 64], 1700, 0.75),     # 5-10 jet
    ([47, 54, 57, 62, 64], 1700, 0.8), ([43, 50, 57, 59, 66], 2000, 0.9),       # 10-15 helicopter
    ([42, 50, 57, 62, 66, 69], 2300, 1.0), ([40, 47, 54, 59, 62, 66], 2400, 1.0), ([43, 50, 55, 59, 64, 67], 2500, 1.0),  # 15-22.5 cards: lift
]
for i, (notes, cut, g) in enumerate(chords):
    strings.add(i * BAR, pad(notes, BAR, att=2.2 if i == 0 else 1.1, rel=1.6, cutoff=cut, seed=i), 0, g)
strings.add(SC['contrail'][0], pad([45, 52, 57, 59, 64, 69, 71], 2.45, att=1.6, rel=0.2, cutoff=1500, seed=20, bright_end=7000), 0, 1.15)
# the bloom: full D major 9 on the downbeat (peak), then the resolve
strings.add(LOGO, pad([38, 50, 57, 62, 64, 66, 69, 74], 2.5 * 2, att=0.25, rel=1.8, cutoff=3200, seed=21), 0, 1.35)
strings.add(LOGO + 2 * BAR, pad([47, 54, 57, 62, 64], BAR, att=0.9, rel=1.4, cutoff=2200, seed=22), 0, 0.8)
strings.add(EV['finalChord'], pad([38, 45, 50, 54, 57, 59, 64, 66, 69], DUR - EV['finalChord'] - 0.4, att=0.4, rel=2.4, cutoff=2600, seed=23), 0, 1.05)

def phrase(t0, notes, pan=0.0, vel=0.8, seed=0):
    for i, (b, deg, octv, v) in enumerate(notes):
        sant.add(t0 + b * BEAT, santoor(midi(sw(deg, octv)), v * vel, 3.2, seed + i), pan + RNG.uniform(-0.15, 0.15))

# 0-5: three sparse notes, then the rising pakad into the first wipe
phrase(0.3, [(0, 'G', 4, .5), (1.5, 'R', 4, .4), (3, 'S', 4, .45)], -0.2, 0.8, 10)
phrase(3.1, [(0, 'D', 3, .45), (0.5, 'S', 4, .5), (1, 'R', 4, .55), (1.5, 'G', 4, .6), (2.0, 'P', 4, .7), (2.5, 'D', 4, .75), (2.75, 'S', 5, .85)], 0.15, 0.85, 20)
# 5-10 jet: motif on the cut; quiet under the voice
phrase(5.0, [(0, 'G', 5, .85), (0.5, 'R', 5, .55), (1.0, 'S', 5, .6), (1.5, 'D', 4, .5)], -0.1, 0.8, 30)
roll(midi(sw('S', 5)), 7.45, 0.9, sant, 0.2, 0.3, seed=40)                    # shimmer at rotation
phrase(9.1, [(0, 'P', 4, .55), (0.333, 'D', 4, .6), (0.667, 'S', 5, .7), (1.0, 'R', 5, .75)], 0.1, 0.85, 50)
# 10-15 helicopter
phrase(10.0, [(0, 'G', 5, .9), (0.5, 'P', 5, .65), (1.0, 'G', 5, .55), (1.25, 'R', 5, .5), (1.5, 'S', 5, .55)], 0.0, 0.8, 60)
roll(midi(sw('G', 5)), EV['heliTouchdown'] - 0.3, 0.6, sant, -0.2, 0.3, seed=70)
# 15-22.5 cards: a rising note as each card lights (Sa Re Ga Pa) with an echo an octave down
for i, (tc, deg) in enumerate(zip(EV['cards'], ['S', 'R', 'G', 'P'])):
    sant.add(tc, santoor(midi(sw(deg, 5)), 0.8, 3.4, 90 + i), [-0.45, -0.15, 0.15, 0.45][i])
    sant.add(tc + BEAT, santoor(midi(sw(deg, 4)), 0.3, 3.0, 95 + i), [-0.45, -0.15, 0.15, 0.45][i] * 0.5)
# 22.5-25 the build: a quickening roll into the bloom
roll(midi(sw('P', 5)), 22.5, 1.25, sant, 0.2, 0.4, rate=0.15625, seed=100)
roll(midi(sw('S', 6)), 23.75, 1.15, sant, -0.2, 0.5, rate=0.078125, seed=120)
# logo: closing phrase under the voice, then the final cadence
phrase(28.1, [(0, 'G', 5, .45), (1.0, 'R', 5, .38), (2.0, 'S', 5, .42)], 0.1, 0.7, 140)
phrase(EV['finalChord'], [(0, 'S', 5, .75), (0.333, 'P', 4, .5), (0.667, 'G', 4, .45), (1.0, 'D', 4, .4), (2.0, 'S', 4, .5)], 0.0, 0.8, 150)
roll(midi(sw('S', 6)), EV['finalChord'] + 0.02, 1.4, sant, 0.25, 0.2, seed=160)

# Pulse: enters with the jet (half time), quarters with the helicopter, eighths on the cards,
# sixteenths in the build, a breath, then the bloom
for b in range(int(SC['jet'][0] / BEAT), int((LOGO - 0.3) / BEAT)):
    tb = b * BEAT; bb = b % 4
    if tb < SC['heli'][0]:
        if bb in (0, 2): perc.add(tb, pulse(0.45 + 0.2 * (tb - 5) / 5))
    elif tb < SC['cards'][0]:
        perc.add(tb, pulse(0.7 if bb == 0 else 0.55))
    elif tb < SC['contrail'][0]:
        perc.add(tb, pulse(0.8 if bb == 0 else 0.6)); perc.add(tb + BEAT / 2, pulse(0.28))
    else:
        perc.add(tb, pulse(0.9)); perc.add(tb + BEAT / 2, pulse(0.5))
        perc.add(tb + BEAT / 4, pulse(0.3)); perc.add(tb + 3 * BEAT / 4, pulse(0.35))
for tc, v in [(CUTS[0], 0.75), (EV['jetRotate'], 0.9), (CUTS[1], 0.8), (EV['heliTouchdown'], 0.7), (CUTS[2], 0.85), (CUTS[3], 0.7), (LOGO, 1.15)]:
    perc.add(tc, drum(v), 0)
perc.add(EV['finalChord'], drum(0.8, 90, 40, 1.4), 0)

# ---- SFX
# light wipes: a soft swish left to right on each cut
for i, tc in enumerate(CUTS):
    sfx.add(tc - 0.3, autopan(whoosh(0.75, 500, 6000, 0.5, seed=300 + i, width=0.5), -0.8, 0.8), 0, 0.32)
# jet: spool-up from the cut, slow motion at rotation (pitch down, highs gone, sub boom), roar back
# at lift-off, then it climbs away (doppler drop, lowpass)
J0 = SC['jet'][0]; JD = SC['jet'][1] - J0
tj = tt(JD + 0.4)
rot0, rot1 = EV['jetRotate'] - J0 - 0.45, EV['jetRotate'] - J0 + 0.95   # slow-motion window
slow = np.clip((tj - rot0) / 0.35, 0, 1) * np.clip((rot1 + 0.35 - tj) / 0.35, 0, 1)
away = np.clip((tj - (EV['jetLiftoff'] - J0 + 0.8)) / 2.2, 0, 1)
pitch = (1 + 0.35 * np.clip(tj / 2.4, 0, 1)) * (1 - 0.38 * slow) * (1 - 0.14 * away)
whine = (np.sin(2 * np.pi * np.cumsum(2400 * pitch) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(4810 * pitch) / SR)) * 0.08
lvl = np.minimum(1, 0.25 + tj / 1.6) * (1 - 0.55 * slow) * (1 - 0.7 * away)
rr = shaped_noise(JD + 0.4, lambda x: 160 + 420 * min(1, x * 2.2), lambda x: 0.75, lambda x: 1, seed=5)
rr_lp = signal.sosfilt(signal.butter(2, 600, 'lp', fs=SR, output='sos'), rr)
rr = rr * (1 - slow) + rr_lp * slow * 1.4
jet = (rr * 0.55 + whine) * lvl
jet = jet * (1 - away * 0.0) 
sfx.add(J0, autopan(jet, -0.3, 0.5), 0, 0.5)
sub = tt(2.2); boom = np.sin(2 * np.pi * np.cumsum(30 + 25 * np.exp(-sub / 0.25)) / SR) * np.exp(-sub / 0.9)
sfx.add(EV['jetRotate'], boom, 0, 0.55)
sfx.add(EV['jetLiftoff'] + 0.4, autopan(whoosh(2.2, 180, 2200, 0.25, seed=2, width=0.6), -0.4, 0.9), 0, 0.55)
# helicopter: rotor blade-pass thumps getting closer, downwash building near the ground, touchdown,
# petals rustling in the wash
H0 = SC['heli'][0]; TDw = EV['heliTouchdown']
th = tt(SC['heli'][1] - H0 + 0.3)
rate = 19.0
k = 0
while k / rate < len(th) / SR:
    tk = k / rate
    near = min(1, 0.25 + tk / (TDw - H0)) if H0 + tk < TDw else 1.0
    fade = 1.0 if H0 + tk < SC['heli'][1] - 0.2 else max(0, 1 - (H0 + tk - SC['heli'][1] + 0.2) / 0.5)
    sfx.add(H0 + tk + RNG.normal(0, 0.002), thump(0.5 * near * fade * (1.15 if k % 2 == 0 else 0.85), f=62 + 8 * near), 0.05, 0.55)
    k += 1
wash_env = lambda x: np.clip((x * (SC['heli'][1] - H0) - (TDw - H0 - 2.4)) / 2.0, 0, 1) * (1 - 0.5 * np.clip((x * (SC['heli'][1] - H0) - (TDw - H0 + 0.4)) / 0.8, 0, 1))
wash = shaped_noise(SC['heli'][1] - H0, lambda x: 500 + 300 * x, lambda x: 0.9, wash_env, seed=11)
sfx.add(H0, autopan(wash, 0.3, -0.3), 0, 0.3)
sfx.add(TDw, thump(0.9, f=48, dec=0.2), 0, 0.6)
sfx.add(TDw - 1.8, rustle(3.0, seed=12) * np.concatenate([np.linspace(0, 1, int(1.2 * SR)), np.linspace(1, 0, int(1.8 * SR))]), 0.2, 0.06)
sfx.add(TDw - 1.0, shimmer(2.0, 2500, 6000, 25, seed=4), 0.0, 0.28)
# cards: a soft glass tick as each arrives, a clear glass chime as each lights with its line
for i, tc in enumerate(TL['events']['cardsIn']):
    bells.add(tc, glass(midi(sw(['S', 'R', 'G', 'P'][i], 6)), 0.22, 1.4, seed=400 + i), [-0.5, -0.17, 0.17, 0.5][i])
for i, tc in enumerate(EV['cards']):
    bells.add(tc, glass(midi(sw(['S', 'R', 'G', 'P'][i], 6)), 0.6, 3.0, seed=410 + i), [-0.45, -0.15, 0.15, 0.45][i])
# transition: the jet flies past close to the lens (doppler) and its contrail whooshes across
C0 = SC['contrail'][0]
tone, ratio, near = doppler_tone(2.8, 1900, EV['passClosest'] - C0, speed=70, miss=26)
fly = shaped_noise(2.8, lambda x: 260 * np.interp(x * 2.8, np.arange(len(ratio)) / SR, ratio), lambda x: 0.8, lambda x: 1, seed=13)
fly = fly * near * 0.6 + tone * 0.1
sfx.add(C0, autopan(fly, -0.9, 0.9), 0, 0.85)
sfx.add(EV['contrailSweep'] - 0.2, autopan(whoosh(1.6, 350, 7000, 0.45, seed=6, width=0.45), -0.9, 0.9), 0, 0.8)
sfx.add(EV['contrailSweep'] + 0.3, autopan(shimmer(1.2, 3000, 9000, 40, seed=7), -0.5, 0.8), 0, 0.45)
sfx.add(LOGO - 1.1, whoosh(1.1, 800, 9000, 0.98, seed=8, width=0.8), 0, 0.3)        # reverse swell into the bloom
# logo: a bell on each petal (Sa Re Ga Pa Sa'), sparkle on the crescent
for i, (kk, deg, o) in enumerate([('petalIvory', 'S', 5), ('petalGold', 'R', 5), ('petalBlue', 'G', 5), ('crescent', 'P', 5), ('arc', 'S', 6)]):
    bells.add(EV[kk], bell(midi(sw(deg, o)), 0.9 if i < 4 else 0.75, seed=200 + i), [-0.35, 0.0, 0.35, 0.0, 0.0][i])
bells.add(EV['crescent'] + 0.25, autopan(shimmer(0.9, 4000, 11000, 60, seed=9), -0.3, 0.3), 0, 0.5)
sfx.add(EV['finalChord'] - 1.6, whoosh(1.62, 3000, 9000, 0.99, seed=10, width=0.9), 0, 0.2)

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
keys = [(0, -7.5), (3.5, -7), (5.0, -6.5), (7.5, -6), (10.0, -5), (15.0, -3.5), (22.5, -2.5), (24.7, -1), (24.95, -2.5),
        (25.0, 0.5), (27.5, 0), (30.0, -1.5), (32.5, -4), (DUR, -6)]
kt, kv = zip(*keys)
out *= (10 ** (np.interp(t, kt, kv) / 20))[:, None]
out *= np.where(t > DUR - 2.2, np.cos(np.clip((t - (DUR - 2.2)) / 2.2, 0, 1) * np.pi / 2) ** 1.5, 1)[:, None]
out *= np.minimum(1, t / 0.05)[:, None]
peak = np.abs(out).max()
out *= 0.5 / peak
sf.write(os.path.join(ROOT, 'audio', 'music.flac'), out.astype(np.float32), SR, subtype='PCM_24')
print('music.flac written, peak normalised to -6 dBFS; duration', DUR)
