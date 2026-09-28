"""QA for the beat grid: per-window phase residual of the beat grid against the
accompaniment onset envelope (drift check), and onset strength folded on the
bar in 16ths (where the accents fall relative to the downbeats).

Run:  uv run python qa_grid.py
"""
import json

import librosa
import numpy as np

import common

a = json.loads((common.DATA / "audio.json").read_text())
beats = np.array(a["beats"])
downs = np.array(a["downbeats"])
acc, sr = common.load_stem("no_vocals", 22050)
hop = 128
o = librosa.onset.onset_strength(y=acc, sr=sr, hop_length=hop)
t = np.arange(len(o)) / sr * hop


def beat_pos(ts, grid):
    i = np.clip(np.searchsorted(grid, ts) - 1, 0, len(grid) - 2)
    return i + (ts - grid[i]) / (grid[i + 1] - grid[i])


print("window   best shift vs grid (ms)   on-beat / mean onset strength")
for w0 in range(0, int(a["duration"]) - 10, 10):
    m = (t >= w0) & (t < w0 + 10)
    best, bs = 0.0, -1.0
    for sh in np.arange(-0.08, 0.081, 0.002):
        ph = beat_pos(t[m] - sh, beats) % 1.0
        s = o[m][(ph < 0.06) | (ph > 0.94)].mean()
        if s > bs:
            bs, best = s, sh
    print(f"{w0:4d}-{w0 + 10:<4d} {best * 1000:+6.0f}   {bs / o[m].mean():.2f}")
bp = beat_pos(t, downs) * 16  # 16ths from the first downbeat
for lab, (s0, s1) in {"0-40s": (0, 40), "all": (0, a["duration"])}.items():
    m = (t >= s0) & (t < s1) & (t >= downs[0])
    pos = np.floor(bp[m] + 0.5).astype(int) % 16
    h = np.array([o[m][pos == k].mean() for k in range(16)])
    print(f"{lab:6s} 16ths:", " ".join(f"{x / h.mean():.2f}" for x in h))
