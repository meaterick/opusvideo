"""Exact vocal onsets for hero words -> data/hero_onsets.json

Impacts in the video (CALL / IN / OPUS, "live", "optimize"...) must land on
the sung attack, not on the CTC word boundary (which can sit 20-150 ms off) or
on the nearest beat.  For each hero word we search the vocal stem around the
CTC start for the strongest attack:

  * log-mel spectral flux of the vocal stem, 2.5 ms hop, 80 mel bands
    (positive differences only, summed over 150 Hz - 8 kHz),
  * plus the rise of the vocal RMS in dB over 15 ms,
  * the onset is the peak of the combined novelty inside
    [ctc_start - 0.12, ctc_start + 0.12], refined to the steepest point of
    the RMS rise just before that peak.

Writes the onset, the CTC start and the correction; qa/hero_<word>.png shows
each search window for a visual check.

Run:  uv run python hero_onsets.py [--plots]
"""
import json
import sys

import librosa
import numpy as np
from scipy.ndimage import uniform_filter1d

import common

SR = 22050
HOP = 55  # ~2.5 ms
HERO = [  # (line prefix, word index)
    ("From a sketch", 2), ("From a sketch", 4), ("From a sketch", 5),
    ("One more pass", 0), ("One more pass", 2), ("One more pass", 4),
    ("When the hard", 2), ("When the hard", 3), ("When the hard", 4),
    ("Give it context", 2), ("Give it context", 5),
    ("Call in Opus", 0), ("Call in Opus", 1), ("Call in Opus", 2),
    ("Give the difficult", 2), ("Give the difficult", 4),
    ("It can reason", 2), ("It can reason", 3), ("It can reason", 5),
]


# Verified by eye on qa/hero_*.png: the "O" vowel of "Opus" starts at 24.417
# (harmonics change there; the CTC boundary 24.52 sits mid-vowel).  The band
# lands on the downbeat at 24.582 and the "-pus" plosive peaks at 24.80.
MANUAL = {"opus": (24.417, "manual: vowel onset verified on spectrogram")}


def main(plots=False):
    lyr = json.loads((common.DATA / "lyrics.json").read_text())
    voc, _ = common.load_stem("vocals", SR)
    S = librosa.feature.melspectrogram(y=voc, sr=SR, n_fft=1024, hop_length=HOP, n_mels=80, fmin=150, fmax=8000)
    L = np.log(S + 1e-6)
    flux = np.maximum(0, np.diff(L, axis=1, prepend=L[:, :1])).sum(axis=0)
    flux = uniform_filter1d(flux, 3)
    rms = librosa.feature.rms(y=voc, frame_length=512, hop_length=HOP)[0]
    db = 20 * np.log10(rms + 1e-6)
    lag = int(0.015 * SR / HOP)
    rise = np.maximum(0, db - np.concatenate([np.full(lag, db[0]), db[:-lag]]))
    nov = flux / (np.percentile(flux, 99) + 1e-9) + rise / (np.percentile(rise, 99) + 1e-9)
    fps = SR / HOP
    out = []
    first_line = {}
    for i, l in enumerate(lyr["lines"]):
        first_line.setdefault(l["text"].split(",")[0][:14], i)
    for prefix, wi in HERO:
        # first occurrence in the PoC window (verse 1 / pre 1 / chorus 1)
        li = next(i for i, l in enumerate(lyr["lines"]) if l["text"].startswith(prefix))
        w = lyr["lines"][li]["words"][wi]
        c = w["start"]
        a0, a1 = int((c - 0.12) * fps), int((c + 0.12) * fps)
        k = a0 + int(np.argmax(nov[a0:a1]))
        # steepest dB slope in the 40 ms before the novelty peak
        b0 = max(0, k - int(0.04 * fps))
        slope = np.diff(db[b0:k + 2])
        q = b0 + int(np.argmax(slope)) if len(slope) else k
        t = q / fps
        # accept corrections up to 90 ms; larger ones latched onto the previous
        # word's attack in every case checked ("to" before "something", "then"
        # before "optimize") unless verified by eye (MANUAL)
        key = w["text"].strip(",.").lower()
        if key in MANUAL:
            use, why = MANUAL[key]
        elif abs(t - c) <= 0.09:
            use, why = t, "detected"
        else:
            use, why = c, "ctc (detected attack belongs to the previous word)"
        out.append(dict(line=li, word=wi, text=w["text"], ctc=w["start"], detected=round(t, 3), onset=round(use, 3),
                        source=why, strength=round(float(nov[k]), 2)))
        print(f"L{li:02d} {w['text']:<12} ctc {c:7.3f}  detected {t:7.3f} ({(t - c) * 1000:+5.0f} ms)  -> {use:7.3f} [{why}]")
        if plots:
            import matplotlib
            matplotlib.use("Agg")
            import matplotlib.pyplot as plt
            s0, s1 = int((c - 0.35) * fps), int((c + 0.45) * fps)
            fig, ax = plt.subplots(2, 1, figsize=(9, 5), sharex=True)
            tt = np.arange(s0, s1) / fps
            ax[0].imshow(L[:, s0:s1], origin="lower", aspect="auto", cmap="magma", extent=[tt[0], tt[-1], 0, 80])
            ax[1].plot(tt, nov[s0:s1], "k", lw=1)
            for x in ax:
                x.axvline(c, color="tab:blue", lw=1.2, label="ctc")
                x.axvline(t, color="lime" if x is ax[0] else "tab:green", lw=1.6, label="onset")
            ax[1].legend(fontsize=7)
            ax[0].set_title(f"{w['text']}  ctc {c:.3f} -> onset {t:.3f}")
            fig.tight_layout()
            fig.savefig(common.QA / f"hero_{li:02d}_{wi}.png", dpi=60)
            plt.close(fig)
    (common.DATA / "hero_onsets.json").write_text(json.dumps(dict(
        method="peak of vocal-stem log-mel flux + 15 ms RMS rise within +-120 ms of the CTC start, "
               "refined to the steepest dB rise in the preceding 40 ms", words=out), indent=1))


if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
