"""Music analysis -> data/audio.json

  * tempo + beat grid: librosa's tracker gives the starting BPM; a constant-
    tempo grid (period + phase) is then fitted to the onset envelope of the
    whole song, and the phase is refined on kick attacks.
  * downbeats: the bar phase (which of the 4 beats is "1") is the one where
    harmonic change (chroma novelty), kick energy and lyric-line starts line
    up best.
  * sections: named from the lyric sheet; each starts on the downbeat of the
    bar holding its first sung word (a pickup of < 2 beats stays in the
    previous section).  Intro / outro / instrumental gaps come from the lyric
    timing and the vocal envelope.
  * energy: 100 fps envelopes (full mix, low/mid/high bands, vocal and
    accompaniment stems) normalised 0..1, a per-bar loudness curve, and
    "energy events" where the bar loudness jumps or drops sharply.
  * onsets: kick / snare / hat attacks from the accompaniment stem and vocal
    note onsets from the vocal stem, each [time, strength 0..1].

Run after align.py (sections use data/lyrics.json):
    uv run python analyze.py [--plots]
"""
from __future__ import annotations

import json
import math
import sys

import librosa
import numpy as np
from scipy.ndimage import median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

import common

SR = 44100
FPS = 100


def band(x, lo, hi, sr=SR):
    if lo and hi:
        sos = butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    elif hi:
        sos = butter(4, hi, btype="low", fs=sr, output="sos")
    else:
        sos = butter(4, lo, btype="high", fs=sr, output="sos")
    return sosfiltfilt(sos, x)


def frame_rms(x, sr=SR, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x.astype(np.float64), (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad ** 2)])
    return np.sqrt(np.maximum((c[idx + win] - c[idx]) / win, 0))


def follow(x, attack=0.010, release=0.090, fps=FPS):
    """Fast-attack / slow-release follower so envelopes read well as motion."""
    aa, ar = math.exp(-1 / (attack * fps)), math.exp(-1 / (release * fps))
    y, s = np.empty_like(x), 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    return np.clip(x / (np.percentile(x, pct) + 1e-12), 0, 1)


def band_onsets(x, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rise_db=10.0):
    """Attacks in one band: peaks of the 20 ms log-energy rise; the reported
    time is the steepest point of the rise.  -> times, peak level dB."""
    xb = band(x, lo, hi)
    h, w = int(hop_s * SR), int(win * SR)
    e = np.convolve(xb.astype(np.float64) ** 2, np.ones(w) / w, mode="same")[::h]
    db = 10 * np.log10(e + 1e-10)
    fps = SR / h
    lag = int(0.02 * fps)
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    slope = uniform_filter1d(np.diff(db, prepend=db[0]), 3)
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rise_db, distance=int(min_gap * fps))
    ts, lv = [], []
    for p in pk:
        a = max(0, p - lag)
        peak = db[p:p + int(0.03 * fps)].max()
        if peak < floor[p] + 3:
            continue
        ts.append((a + int(np.argmax(slope[a:p + 1]))) / fps)
        lv.append(peak)
    return np.array(ts), np.array(lv)


def strength01(v):
    if len(v) == 0:
        return v
    lo, hi = np.percentile(v, 5), np.percentile(v, 95)
    return np.clip((v - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


# ---------------------------------------------------------------------------
def track_beats(mix, acc, duration):
    """Variable-tempo beat grid.  The tempo drifts (about 132 BPM in the intro,
    135.1 BPM from ~70 s on), so one constant grid is off by up to +-300 ms.
      1. dynamic-programming beat tracking (librosa, high tightness) on a
         combined accompaniment + mix onset envelope (2.9 ms hop),
      2. repair doubled / skipped beats (IBI outside 0.6..1.5 x local median),
      3. snap each beat to the strongest onset within +-25 ms,
      4. smooth with a local linear fit over +-6 beats (follows the drift, no
         beat-to-beat jitter in the visuals),
      5. extend to the song edges with the local period."""
    sr, hop = 22050, 64
    ofps = sr / hop
    oa = librosa.onset.onset_strength(y=librosa.resample(acc, orig_sr=SR, target_sr=sr), sr=sr, hop_length=hop)
    om = librosa.onset.onset_strength(y=librosa.resample(mix, orig_sr=SR, target_sr=sr), sr=sr, hop_length=hop)
    o = oa / (np.percentile(oa, 99) + 1e-9) + 0.5 * om / (np.percentile(om, 99) + 1e-9)
    tempo0 = float(np.atleast_1d(librosa.feature.tempo(onset_envelope=o, sr=sr, hop_length=hop, start_bpm=130))[0])
    _, bt = librosa.beat.beat_track(onset_envelope=o, sr=sr, hop_length=hop, start_bpm=tempo0,
                                    tightness=300, units="time", trim=False)
    # 2. repair
    fixed = [float(bt[0])]
    for b in bt[1:]:
        loc = np.median(np.diff(fixed[-9:])) if len(fixed) > 3 else 60 / tempo0
        gap = float(b) - fixed[-1]
        if gap < 0.6 * loc:
            continue  # doubled beat
        n = max(1, int(round(gap / loc)))
        last = fixed[-1]
        fixed.extend(last + gap * j / n for j in range(1, n))  # skipped beats
        fixed.append(float(b))
    bt = np.array(fixed)
    # 3. snap to onset peaks
    snapped = bt.copy()
    w = int(0.025 * ofps)
    for i, b in enumerate(bt):
        c = int(round(b * ofps))
        a0, a1 = max(0, c - w), min(len(o), c + w + 1)
        if a1 > a0:
            snapped[i] = (a0 + int(np.argmax(o[a0:a1]))) / ofps
    # 4. local linear smoothing
    k = np.arange(len(snapped))
    sm = np.array([np.polyval(np.polyfit(k[max(0, i - 6):i + 7], snapped[max(0, i - 6):i + 7], 1), i)
                   for i in range(len(snapped))])
    res = snapped - sm
    # 5. extend to the edges
    head, P0 = [], sm[1] - sm[0]
    t = sm[0] - P0
    while t > -1e-9:
        head.insert(0, t)
        t -= P0
    tail, P1 = [], sm[-1] - sm[-2]
    t = sm[-1] + P1
    while t < duration:
        tail.append(t)
        t += P1
    beats = np.concatenate([head, sm, tail])
    return tempo0, beats, res, np.diff(beats)


def local_bpm_report(beats, every=15.0):
    ibi = np.diff(beats)
    out, t = [], 0.0
    while t < beats[-1]:
        m = (beats[:-1] >= t) & (beats[:-1] < t + every)
        if m.any():
            out.append(f"{t:.0f}s:{60 / np.median(ibi[m]):.2f}")
        t += every
    return " ".join(out)


def bar_phase(beats, mix, acc, line_starts):
    """Which beat index mod 4 is the downbeat."""
    y = librosa.resample(mix, orig_sr=SR, target_sr=22050)
    hop = 512
    chroma = librosa.feature.chroma_cqt(y=y, sr=22050, hop_length=hop)
    fr = librosa.time_to_frames(beats, sr=22050, hop_length=hop)
    fr = np.clip(fr, 0, chroma.shape[1] - 1)
    # mean chroma per beat, novelty = change from previous beat
    segs = np.split(chroma, fr[1:], axis=1)
    bc = np.stack([s.mean(axis=1) if s.shape[1] else np.zeros(12) for s in segs])
    bc = bc / (np.linalg.norm(bc, axis=1, keepdims=True) + 1e-9)
    nov = np.r_[0, 1 - np.sum(bc[1:] * bc[:-1], axis=1)][: len(beats)]
    low = frame_rms(band(acc, None, 120))
    lowb = np.array([low[min(len(low) - 1, int(t * FPS))] for t in beats])
    lowb = lowb / (lowb.max() + 1e-9)
    ls = np.zeros(len(beats))
    for t in line_starts:  # a sung line tends to start on (or just before) a downbeat
        k = int(np.argmin(np.abs(beats - t)))
        if abs(beats[k] - t) < 0.25:
            ls[k] += 1
    scores = []
    for ph in range(4):
        m = (np.arange(len(beats)) % 4) == ph
        scores.append(nov[m].mean() / (nov.mean() + 1e-9) + 0.5 * lowb[m].mean() / (lowb.mean() + 1e-9)
                      + 1.0 * ls[m].sum() / (ls.sum() + 1e-9))
    return int(np.argmax(scores)), [round(float(s), 3) for s in scores]


def build_sections(lyr, downbeats, P, duration, vocal_env):
    """Lyric sections snapped to downbeats + intro/outro/instrumental gaps."""
    bar = 4 * P

    def snap_start(t):
        k = int(np.searchsorted(downbeats, t + 1e-6)) - 1  # downbeat at or before t
        k = max(k, 0)
        # a pickup of up to 2.5 beats ("Call in" before "OPUS" lands on the
        # downbeat) belongs to the previous section
        if downbeats[min(k + 1, len(downbeats) - 1)] - t < 2.5 * P and downbeats[k] < t:
            k += 1
        return float(downbeats[min(k, len(downbeats) - 1)])

    secs = []
    for s in lyr["sections"]:
        secs.append(dict(name=s["id"], title=s["title"], start=snap_start(s["start"]),
                         sung_start=s["start"], sung_end=s["end"]))
    out = []
    if secs[0]["start"] > 0.5:
        out.append(dict(name="intro", title="Intro", start=0.0))
    for i, s in enumerate(secs):
        # an instrumental gap of >= 2 bars before this section becomes its own section
        if i > 0:
            gap_from = secs[i - 1]["sung_end"]
            k = int(np.searchsorted(downbeats, gap_from + P))
            if k < len(downbeats) and s["start"] - downbeats[k] >= 2 * bar - 1e-3:
                out.append(dict(name=f"break{sum(1 for o in out if o['name'].startswith('break')) + 1}",
                                title="Instrumental", start=float(downbeats[k])))
        out.append(dict(name=s["name"], title=s["title"], start=s["start"]))
    # song end: where the mix envelope finally dies away
    for i, s in enumerate(out):
        s["end"] = out[i + 1]["start"] if i + 1 < len(out) else duration
    for s in out:
        s["start"], s["end"] = round(s["start"], 3), round(s["end"], 3)
        s["bars"] = round((s["end"] - s["start"]) / bar, 2)
    return out


def main(plots=False):
    mix, _ = common.load_mix(SR)
    duration = len(mix) / SR
    voc, _ = common.load_stem("vocals", SR)
    acc, _ = common.load_stem("no_vocals", SR)
    voc = np.pad(voc, (0, max(0, len(mix) - len(voc))))[: len(mix)]
    acc = np.pad(acc, (0, max(0, len(mix) - len(acc))))[: len(mix)]
    lyr = json.loads((common.DATA / "lyrics.json").read_text())

    tempo0, beats, res, ibi = track_beats(mix, acc, duration)
    P = float(np.median(ibi))
    bpm = 60 / P
    line_starts = [l["start"] for l in lyr["lines"]]
    ph, ph_scores = bar_phase(beats, mix, acc, line_starts)
    downbeats = beats[(np.arange(len(beats)) % 4) == ph]
    print(f"tempo: estimate {tempo0:.2f}, median {bpm:.3f} BPM; {len(beats)} beats, onset-snap residual "
          f"sd {res.std() * 1000:.1f} ms; IBI {ibi.min() * 1000:.1f}..{ibi.max() * 1000:.1f} ms")
    print("local BPM:", local_bpm_report(beats))
    print(f"bar phase {ph} (scores {ph_scores}); first downbeat {downbeats[0]:.3f}s")

    # envelopes
    n = int(math.ceil(duration * FPS))
    env = {"rms": frame_rms(mix)}
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = frame_rms(band(mix, lo, hi))
    env["vocal"] = frame_rms(voc)
    env["band"] = frame_rms(acc)
    for k in env:
        env[k] = norm01(follow(env[k][:n]))

    # per-bar loudness (dB of the mean power over the bar) + energy events
    raw = frame_rms(mix)
    bars_db = []
    for i, t in enumerate(downbeats):
        a, b = int(t * FPS), int(min(duration, t + 4 * P) * FPS)
        bars_db.append(float(10 * np.log10(np.mean(raw[a:b] ** 2) + 1e-10)) if b > a else -100.0)
    bars_db = np.array(bars_db)
    ref = np.percentile(bars_db, 95)
    energy = np.clip((bars_db - (ref - 18)) / 18, 0, 1)
    events = []
    for i in range(1, len(bars_db)):
        d = bars_db[i] - bars_db[i - 1]
        if abs(d) >= 3.0:
            events.append(dict(t=round(float(downbeats[i]), 3), bar=i, kind="rise" if d > 0 else "drop",
                               db=round(float(d), 2)))

    sections = build_sections(lyr, downbeats, P, duration, env["vocal"])

    # stops: the band drops out (accompaniment < 6% for >= 0.4 s) inside the
    # song, e.g. the a-cappella "Call in" before the chorus lands
    stops = []
    band_env = env["band"]
    quiet = band_env < 0.06
    i = int(2 * FPS)
    while i < len(quiet) - int(4 * FPS):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]:
                j += 1
            if (j - i) / FPS >= 0.4:
                stops.append(dict(start=round(i / FPS, 3), end=round(j / FPS, 3)))
            i = j
        i += 1
    # onsets
    kt, kdb = band_onsets(acc, None, 120, win=0.012, min_gap=0.15, rise_db=12)
    st, sdb = band_onsets(acc, 1500, 5000, win=0.010, min_gap=0.15, rise_db=10)
    # a snare has a long noisy tail; keep the loud-tail class only
    xb = band(acc, 500, 5000)
    e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))
    tail = np.array([20 * np.log10(e[int((t + 0.04) * SR):int((t + 0.12) * SR)].mean() + 1e-9) for t in st])
    if len(st):
        rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
        keep = (rel > -6) & (tail > np.percentile(tail, 95) - 22)
        st, stail = st[keep], tail[keep]
    else:
        stail = sdb
    ht, hdb = band_onsets(acc, 7000, None, win=0.006, min_gap=0.06, rise_db=9)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            ht, hdb = ht[dist > gap], hdb[dist > gap]
    vt, vdb = band_onsets(voc, 150, 4000, win=0.015, min_gap=0.09, rise_db=9)
    onsets = {k: [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ts, strength01(v))]
              for k, (ts, v) in dict(kick=(kt, kdb), snare=(st, stail), hat=(ht, hdb), vocal=(vt, vdb)).items()}

    def pos8(ts):
        p = np.round((np.asarray(ts) - downbeats[0]) / (P / 2)).astype(int) % 8
        return np.bincount(p, minlength=8).tolist()

    print("kick  8th positions in bar:", pos8(kt))
    print("snare 8th positions in bar:", pos8(st))
    print("hat   8th positions in bar:", pos8(ht))

    doc = dict(
        source="audio/song.mp3",
        duration=round(duration, 3),
        bpm=round(bpm, 3),
        beat_period=round(P, 5),
        time_signature=4,
        first_downbeat=round(float(downbeats[0]), 3),
        beats=[round(float(t), 3) for t in beats],
        downbeats=[round(float(t), 3) for t in downbeats],
        sections=sections,
        bar_energy=[round(float(x), 3) for x in energy],
        energy_events=events,
        stops=stops,
        fps=FPS,
        env={k: [round(float(x), 3) for x in v] for k, v in env.items()},
        onsets=onsets,
        notes=(
            "Times are seconds on the gapless mp3 decode (what browsers play). The tempo drifts "
            "(~132 BPM at the start, ~135.1 BPM from ~70 s), so beats is a variable grid (tracked, "
            "snapped to onsets, smoothed over +-6 beats); bpm / beat_period are medians. Interpolate "
            "the beats / downbeats arrays for beat and bar position; downbeats = every 4th beat. "
            "env: 100 fps, frame i centred at i/100 s, 46 ms RMS, 10 ms attack / 90 ms release follower, "
            "normalised by the 99th percentile. low <150 Hz, mid 150-2000 Hz, high >4 kHz of the mix; "
            "vocal / band = Demucs vocal / accompaniment stems. bar_energy: per-bar loudness mapped "
            "0..1 over the top 18 dB. energy_events: bars whose loudness changes by >= 3 dB. "
            "stops: spans where the accompaniment drops out (< 6% for >= 0.4 s). "
            "onsets [t, strength]: kick <120 Hz, snare 1.5-5 kHz with a noise tail, hat >7 kHz (from "
            "the accompaniment stem), vocal = note attacks in the vocal stem."),
    )
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))
    print(f"wrote data/audio.json: {len(beats)} beats, {len(downbeats)} bars, {len(kt)} kicks, "
          f"{len(st)} snares, {len(ht)} hats, {len(vt)} vocal onsets, {len(events)} energy events")
    for s in sections:
        print(f"  {s['start']:7.2f}-{s['end']:7.2f}  {s['name']:<9} {s['bars']:5.2f} bars")
    for ev in events:
        print(f"  energy {ev['kind']:4} at {ev['t']:7.2f} (bar {ev['bar']}, {ev['db']:+.1f} dB)")
    for s in stops:
        print(f"  band stop {s['start']:7.2f}-{s['end']:7.2f}")
    if plots:
        make_plots(doc, lyr)


def make_plots(doc, lyr, t0=None, t1=None):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    t = np.arange(len(doc["env"]["rms"])) / FPS
    fig, ax = plt.subplots(2, 1, figsize=(26, 7), sharex=True)
    for k, c in (("rms", "k"), ("low", "tab:red"), ("high", "tab:blue")):
        ax[0].plot(t, doc["env"][k], color=c, lw=0.6, label=k)
    for k, c in (("vocal", "tab:purple"), ("band", "tab:orange")):
        ax[1].plot(t, doc["env"][k], color=c, lw=0.6, label=k)
    for s in doc["sections"]:
        for a in ax:
            a.axvline(s["start"], color="tab:red", lw=1.4)
        ax[0].text(s["start"] + 0.3, 1.03, s["name"], color="tab:red", fontsize=9)
    for a in ax:
        a.legend(loc="upper right", fontsize=8)
    fig.tight_layout()
    fig.savefig(common.QA / "audio_overview.png", dpi=60)
    plt.close(fig)


if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
