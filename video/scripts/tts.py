"""
Female voiceover for the Vaanika film, made with Kokoro-82M (Apache-2.0).

Each line is its own file (audio/vo1.wav ... vo5.wav) so a human recording can replace it
later: drop a new vo3.wav in audio/, run `python scripts/vo_timings.py` (subtitle timings)
and `python scripts/mix.py` (music ducking + final mix), then `node scripts/mux.mjs`.
The visuals never need re-rendering for a voice change.

Run with Python 3.10-3.12:  pip install "kokoro>=0.9.4" soundfile scipy pyloudnorm
"""
import json, os
import numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy import signal
from kokoro import KPipeline

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, '..', 'audio')

VOICE = 'hf_beta'      # Kokoro's Hindi female voice: warm, Indian accent
LANG = 'b'             # British-English G2P: non-rhotic, closest to Indian English
SPEED = 0.86           # unhurried
SPEED_BY_LINE = {'vo4': 0.93}   # the longest line, kept clear of the logo reveal
# "Vaanika" said VAA-ni-kaa (stress on the first syllable, long final a)
VAANIKA = '[Vaanika](/vˈɑnikˌɑ/)'

# Each line is a list of phrases; numbers between them are pauses in seconds.
LINES = {
    'vo1': ["Some arrivals are remembered forever."],
    'vo2': ["Private jets...", 0.34, "your family, flown in together."],
    'vo3': ["Helicopter arrivals...", 0.34, "an entrance they'll never forget."],
    'vo4': ["Licensed operators only.", 0.22, "Every permit checked.", 0.22,
            "One all-in price.", 0.26, "And one coordinator, until you land."],
    'vo5': [f"{VAANIKA}.", 0.42, "Private jets and helicopters for Indian weddings.", 0.46,
            f"Fly {VAANIKA}."],
}

SR_TTS, SR = 24000, 48000
TARGET_LUFS = -20.0


def trim(a, thr_db=-48):
    """Trim silence at both ends, keeping a few ms of air."""
    env = np.abs(a)
    thr = 10 ** (thr_db / 20) * env.max()
    idx = np.where(env > thr)[0]
    lo, hi = max(idx[0] - int(0.012 * SR_TTS), 0), min(idx[-1] + int(0.06 * SR_TTS), len(a))
    return a[lo:hi]


def eq(a, sr):
    """Gentle warmth: high-pass 70 Hz, small low-mid lift, soft top end, light de-ess."""
    sos = signal.butter(2, 70, 'hp', fs=sr, output='sos'); a = signal.sosfilt(sos, a)
    # +2 dB around 220 Hz (warmth)
    b, ac = peaking(220, 2.0, 0.8, sr); a = signal.lfilter(b, ac, a)
    # -2.5 dB around 6.5 kHz (sibilance)
    b, ac = peaking(6500, -2.5, 2.0, sr); a = signal.lfilter(b, ac, a)
    # +1.5 dB air shelf at 11 kHz
    b, ac = shelf(11000, 1.5, sr); a = signal.lfilter(b, ac, a)
    return a


def peaking(f0, gain_db, q, sr):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / sr; al = np.sin(w) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w), 1 - al / A]
    return np.array(b) / a[0], np.array(a) / a[0]


def shelf(f0, gain_db, sr):
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / sr; al = np.sin(w) / 2 * np.sqrt(2)
    cw = np.cos(w)
    b = [A * ((A + 1) + (A - 1) * cw + 2 * np.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * cw),
         A * ((A + 1) + (A - 1) * cw - 2 * np.sqrt(A) * al)]
    a = [(A + 1) - (A - 1) * cw + 2 * np.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * cw),
         (A + 1) - (A - 1) * cw - 2 * np.sqrt(A) * al]
    return np.array(b) / a[0], np.array(a) / a[0]


def main():
    pipe = KPipeline(lang_code=LANG, repo_id='hexgrad/Kokoro-82M')
    meter = pyln.Meter(SR)
    info = {}
    for name, parts in LINES.items():
        out = []
        for p in parts:
            if isinstance(p, (int, float)):
                out.append(np.zeros(int(p * SR_TTS)))
                continue
            chunks = [np.asarray(a) for _, _, a in pipe(p, voice=VOICE, speed=SPEED_BY_LINE.get(name, SPEED))]
            out.append(trim(np.concatenate(chunks)))
        a = np.concatenate(out).astype(np.float64)
        a = signal.resample_poly(a, 2, 1)            # 24k -> 48k
        a = eq(a, SR)
        fade = int(0.012 * SR); a[:fade] *= np.linspace(0, 1, fade); a[-fade * 4:] *= np.linspace(1, 0, fade * 4)
        a = pyln.normalize.loudness(a, meter.integrated_loudness(a), TARGET_LUFS)
        peak = np.abs(a).max()
        if peak > 0.7: a *= 0.7 / peak
        path = os.path.join(AUDIO, f'{name}.wav')
        sf.write(path, a.astype(np.float32), SR, subtype='PCM_24')
        info[name] = round(len(a) / SR, 3)
        print(name, info[name], 's')
    with open(os.path.join(AUDIO, 'vo-durations.json'), 'w') as f:
        json.dump(info, f, indent=2)


if __name__ == '__main__':
    main()
