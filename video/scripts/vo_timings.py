"""
Subtitle timings for each voiceover line, read from the audio itself: each line is split into its
captions at the natural pauses between phrases (the N-1 longest silences for N captions). Works the
same for a human recording. Re-run after replacing any audio/voN.wav. Writes src/data/captions.json.
"""
import json, os
import numpy as np, soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
TIMELINE = json.load(open(os.path.join(ROOT, 'src', 'data', 'timeline.json')))

CAPTIONS = {
    'vo1': ["Some arrivals are remembered forever."],
    'vo2': ["Private jets…", "your family, flown in together."],
    'vo3': ["Helicopter arrivals…", "an entrance they’ll never forget."],
    'vo4': ["Licensed operators only.", "Every permit checked.", "One all-in price.",
            "And one coordinator, until you land."],
    'vo5': ["Vaanika.", "Private jets and helicopters for Indian weddings.", "Fly Vaanika."],
}
HOP = 0.01


def speech_spans(a, sr, n):
    """Return n (start, end) spans in seconds, split at the n-1 longest interior pauses."""
    hop = int(HOP * sr)
    frames = len(a) // hop
    rms = np.array([np.sqrt(np.mean(a[i * hop:(i + 1) * hop] ** 2)) for i in range(frames)])
    db = 20 * np.log10(rms + 1e-9)
    voiced = db > db.max() - 38
    idx = np.where(voiced)[0]
    first, last = idx[0], idx[-1]
    gaps, i = [], first
    while i <= last:
        if not voiced[i]:
            j = i
            while j <= last and not voiced[j]:
                j += 1
            gaps.append((j - i, i, j))
            i = j
        else:
            i += 1
    cuts = sorted(sorted(gaps, reverse=True)[:n - 1], key=lambda g: g[1])
    bounds = [first] + [x for g in cuts for x in (g[1], g[2])] + [last + 1]
    return [(bounds[2 * k] * HOP, bounds[2 * k + 1] * HOP) for k in range(n)]


def main():
    out = []
    for name, caps in CAPTIONS.items():
        a, sr = sf.read(os.path.join(ROOT, 'audio', f'{name}.wav'))
        if a.ndim > 1: a = a.mean(axis=1)
        start = TIMELINE['vo'][name]
        for cap, (t0, t1) in zip(caps, speech_spans(a, sr, len(caps))):
            out.append({'line': name, 'text': cap, 'start': round(start + t0, 3), 'end': round(start + t1, 3)})
    # hold each caption until just before the next one (no flicker), at most +0.6 s after speech
    for i, c in enumerate(out):
        nxt = out[i + 1]['start'] - 0.05 if i + 1 < len(out) else c['end'] + 0.6
        c['end'] = round(min(c['end'] + 0.6, nxt), 3)
    with open(os.path.join(ROOT, 'src', 'data', 'captions.json'), 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    for c in out: print(f"{c['start']:6.2f}-{c['end']:6.2f}  {c['text']}")


if __name__ == '__main__':
    main()
