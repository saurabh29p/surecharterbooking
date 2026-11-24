# Spectrogram + loudness + onsets report for a mix: python scripts/audio_report.py audio/music.flac out/music_report.png
import json, sys
import numpy as np, soundfile as sf, pyloudnorm as pyln, librosa
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
src, out = sys.argv[1], sys.argv[2]
TL = json.load(open('src/data/timeline.json'))
x, sr = sf.read(src); mono = x.mean(1) if x.ndim > 1 else x
meter = pyln.Meter(sr)
print('integrated LUFS %.1f  sample peak %.2f dBFS' % (meter.integrated_loudness(x), 20 * np.log10(np.abs(x).max())))
# true peak (4x oversampled)
import scipy.signal as ss
tp = 20 * np.log10(np.abs(ss.resample_poly(x, 4, 1, axis=0)).max()); print('true peak %.2f dBTP' % tp)
win = int(sr * 0.4); hop = int(sr * 0.1)
st = [meter.integrated_loudness(x[i:i + int(sr * 3)]) if i + int(sr * 3) <= len(x) else np.nan for i in range(0, len(x), hop)]
mom = [10 * np.log10(np.mean(mono[i:i + win] ** 2) + 1e-12) for i in range(0, len(mono) - win, hop)]
on = librosa.onset.onset_strength(y=mono, sr=sr, hop_length=512)
peaks = librosa.util.peak_pick(on, pre_max=8, post_max=8, pre_avg=20, post_avg=20, delta=np.percentile(on, 97) * 0.5, wait=10)
ot = peaks * 512 / sr
grid = np.arange(0, TL['duration'], TL['beat'] / 2)
dev = [min(abs(o - grid)) for o in ot]
print('strong onsets:', ' '.join('%.2f' % o for o in ot))
print('onset distance to nearest 8th-note grid: median %.3fs  max %.3fs' % (np.median(dev), max(dev)))
fig, ax = plt.subplots(2, 1, figsize=(22, 9), gridspec_kw={'height_ratios': [3, 1]}, sharex=True)
S = librosa.amplitude_to_db(np.abs(librosa.stft(mono, n_fft=4096, hop_length=512)), ref=np.max)
librosa.display.specshow(S, sr=sr, hop_length=512, x_axis='time', y_axis='log', ax=ax[0], vmin=-80, cmap='magma')
ax[1].plot(np.arange(len(mom)) * 0.1 + 0.2, mom, lw=.8, label='momentary RMS dB')
ax[1].plot(np.arange(len(st)) * 0.1 + 1.5, st, lw=1.2, label='3s LUFS')
for k, (a, b) in TL['scenes'].items():
    for a_ in ax: a_.axvline(a, color='cyan', lw=1.2)
    ax[0].text(a + .1, 12000, k, color='cyan', fontsize=11)
for k, v in TL['events'].items():
    for t in (v if isinstance(v, list) else [v]):
        ax[1].axvline(t, color='orange', lw=.6, ls='--')
for k, t in TL['vo'].items(): ax[1].axvline(t, color='lime', lw=1); ax[1].text(t, -10, k, color='green')
for o in ot: ax[0].axvline(o, color='white', lw=.4, alpha=.5)
ax[1].legend(loc='lower left'); ax[1].set_ylim(-60, 0); ax[1].set_xlim(0, TL['duration'])
import librosa.display
plt.tight_layout(); plt.savefig(out, dpi=70)
