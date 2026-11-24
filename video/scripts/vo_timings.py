"""
Subtitle timings for each voiceover line, read from the audio itself with faster-whisper
(MIT; model weights MIT). Re-run after replacing any audio/voN.wav with a human recording.
Writes src/data/captions.json, which the subtitled compositions read.
"""
import difflib, json, os, re
import numpy as np, soundfile as sf
from scipy import signal
from faster_whisper import WhisperModel

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
TIMELINE = json.load(open(os.path.join(ROOT, 'src', 'data', 'timeline.json')))

# Caption text exactly as it should read on screen, one entry per caption card.
CAPTIONS = {
    'vo1': ["Some arrivals are remembered forever."],
    'vo2': ["Private jets…", "your family, flown in together."],
    'vo3': ["Helicopter arrivals…", "an entrance they’ll never forget."],
    'vo4': ["Licensed operators only.", "Every permit checked.", "One all-in price.",
            "And one coordinator, until you land."],
    'vo5': ["Vaanika.", "Private jets and helicopters for Indian weddings.", "Fly Vaanika."],
}


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower())


def main():
    model = WhisperModel("small", device="cpu", compute_type="int8")
    out = []
    for name, caps in CAPTIONS.items():
        path = os.path.join(ROOT, 'audio', f'{name}.wav')
        a, sr = sf.read(path)
        if a.ndim > 1: a = a.mean(axis=1)
        a16 = signal.resample_poly(a, 16000, sr).astype(np.float32)
        segs, _ = model.transcribe(a16, language="en", word_timestamps=True, beam_size=5,
                                   initial_prompt="Vaanika. Private jets and helicopters.")
        words = [(w.word, w.start, w.end) for s in segs for w in s.words]
        start = TIMELINE['vo'][name]
        dur = len(a) / sr
        # Align script words to recognised words (difflib on normalised spellings); script
        # words whisper merged or misheard get times interpolated from their neighbours.
        script = [w for c in caps for w in c.split()]
        sn, rn = [norm(w) for w in script], [norm(w[0]) for w in words]
        times = [None] * len(script)
        for blk in difflib.SequenceMatcher(a=sn, b=rn, autojunk=False).get_matching_blocks():
            for i in range(blk.size):
                times[blk.a + i] = (words[blk.b + i][1], words[blk.b + i][2])
        known = [i for i, t in enumerate(times) if t]
        for i, t in enumerate(times):
            if t: continue
            prv = max([j for j in known if j < i], default=None)
            nxt = min([j for j in known if j > i], default=None)
            a0 = times[prv][1] if prv is not None else 0.0
            b0 = times[nxt][0] if nxt is not None else dur
            span = (nxt if nxt is not None else len(script)) - (prv if prv is not None else -1)
            pos = i - (prv if prv is not None else -1)
            t0 = a0 + (b0 - a0) * (pos - 1) / span; t1 = a0 + (b0 - a0) * pos / span
            times[i] = (t0, t1)
        k = 0
        for cap in caps:
            n = len(cap.split())
            t0, t1 = times[k][0], times[k + n - 1][1]; k += n
            out.append({'line': name, 'text': cap, 'start': round(start + t0, 3),
                        'end': round(start + t1, 3)})
        print(name, [(w[0].strip(), round(w[1], 2)) for w in words])
    # Hold each caption until just before the next one (no flicker), max +0.6 s after speech.
    for i, c in enumerate(out):
        nxt = out[i + 1]['start'] - 0.05 if i + 1 < len(out) else c['end'] + 0.6
        c['end'] = round(min(c['end'] + 0.6, nxt), 3)
    with open(os.path.join(ROOT, 'src', 'data', 'captions.json'), 'w') as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    for c in out: print(f"{c['start']:6.2f}-{c['end']:6.2f}  {c['text']}")


if __name__ == '__main__':
    main()
