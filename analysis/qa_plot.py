"""Zoomed QA plot of a time window: mix + vocal-stem spectrograms, vocal /
band envelopes, the beat grid, sections, and word timings (CTC, and the
whisper cross-check) -> qa/window_<t0>_<t1>.png

Run:  uv run python qa_plot.py 7 31
"""
import json
import sys

import librosa
import matplotlib
import numpy as np

import common

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

t0, t1 = float(sys.argv[1]), float(sys.argv[2])
a = json.loads((common.DATA / "audio.json").read_text())
lyr = json.loads((common.DATA / "lyrics.json").read_text())
wh = json.loads((common.WORK / "whisper_words.json").read_text()) if (common.WORK / "whisper_words.json").exists() else []
sr = 22050
mix, _ = common.load_mix(sr)
voc, _ = common.load_stem("vocals", sr)
seg = lambda x: x[int(t0 * sr):int(t1 * sr)]

fig, ax = plt.subplots(4, 1, figsize=(30, 14), sharex=True, gridspec_kw=dict(height_ratios=[2, 2, 1.2, 1.4]))
for i, (y, lab) in enumerate(((seg(mix), "mix"), (seg(voc), "vocal stem"))):
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=2048, hop_length=256)), ref=np.max)
    ax[i].imshow(S, origin="lower", aspect="auto", cmap="magma", vmin=-70, vmax=0,
                 extent=[t0, t0 + S.shape[1] * 256 / sr, 0, sr / 2])
    ax[i].set_ylim(0, 6000 if i else 8000)
    ax[i].set_ylabel(lab)
tt = np.arange(len(a["env"]["rms"])) / a["fps"]
m = (tt >= t0) & (tt <= t1)
for k, c in (("vocal", "tab:purple"), ("band", "tab:orange"), ("low", "tab:red")):
    ax[2].plot(tt[m], np.array(a["env"][k])[m], color=c, lw=1, label=k)
ax[2].legend(loc="upper left", fontsize=8)
for b in a["beats"]:
    if t0 <= b <= t1:
        for x in ax:
            x.axvline(b, color="w" if x in ax[:2] else "gray", lw=0.5, alpha=0.5)
for b in a["downbeats"]:
    if t0 <= b <= t1:
        for x in ax:
            x.axvline(b, color="c", lw=1.6)
for s in a["sections"]:
    if t0 <= s["start"] <= t1:
        for x in ax:
            x.axvline(s["start"], color="tab:red", lw=3)
        ax[2].text(s["start"] + 0.05, 0.9, s["name"], color="tab:red", fontsize=14)
# words
for l in lyr["lines"]:
    for w in l["words"]:
        if t0 <= w["start"] <= t1:
            ax[3].add_patch(plt.Rectangle((w["start"], 0.55), w["end"] - w["start"], 0.35,
                                          color=plt.cm.RdYlGn(w["conf"]), alpha=0.8))
            ax[3].text(w["start"], 0.95, w["text"], fontsize=10, rotation=30)
            ax[1].axvline(w["start"], color="lime", lw=1, alpha=0.8)
for w in wh:
    if t0 <= w["start"] <= t1:
        ax[3].add_patch(plt.Rectangle((w["start"], 0.05), w["end"] - w["start"], 0.35, color="tab:blue", alpha=0.5))
        ax[3].text(w["start"], 0.12, w["w"], fontsize=8, color="navy")
ax[3].set_ylim(0, 1.3)
ax[3].set_ylabel("CTC (top, colour=conf)\nwhisper (bottom)")
ax[3].set_xlim(t0, t1)
ax[3].set_xticks(np.arange(np.ceil(t0), t1, 0.5))
fig.tight_layout()
out = common.QA / f"window_{t0:g}_{t1:g}.png"
fig.savefig(out, dpi=55)
print(out)
