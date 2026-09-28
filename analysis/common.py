"""Shared paths and audio loading for the analysis scripts.

Timeline convention: every time in data/*.json is seconds on the *gapless*
decode of audio/song.mp3 (what ffmpeg and browsers produce, encoder delay
removed).  Demucs stems can be offset from that by the decoder delay; the
offset is measured by cross-correlation (see stem_offset) and removed on load.
"""
from __future__ import annotations

import functools
import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
AUDIO = ROOT / "audio" / "song.mp3"
LYRICS_TXT = ROOT / "lyrics" / "lyrics.txt"
DATA = ROOT / "data"
WORK = HERE / "work"
QA = HERE / "qa"
STEMS = HERE / "stems" / "htdemucs" / "song"
for d in (DATA, WORK, QA):
    d.mkdir(parents=True, exist_ok=True)


def decode_mix(sr: int = 44100) -> Path:
    """Gapless decode of the mp3 to a float WAV (cached)."""
    out = WORK / f"mix_{sr}.wav"
    if not out.exists():
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(AUDIO), "-vn",
                        "-ac", "2", "-ar", str(sr), "-c:a", "pcm_f32le", str(out)], check=True)
    return out


def load_mix(sr: int = 44100, mono: bool = True):
    x, r = sf.read(decode_mix(sr), dtype="float32", always_2d=True)
    assert r == sr
    return (x.mean(axis=1) if mono else x.T), sr


def _resample(x: np.ndarray, sr_in: int, sr: int) -> np.ndarray:
    if sr_in == sr:
        return x
    import librosa
    return librosa.resample(x, orig_sr=sr_in, target_sr=sr, res_type="soxr_hq")


@functools.lru_cache(maxsize=1)
def stem_offset() -> float:
    """Seconds to *subtract* from stem times to land on the mix timeline,
    from cross-correlating (vocals + no_vocals) against the gapless mix."""
    cache = WORK / "stem_offset.json"
    if cache.exists():
        return json.loads(cache.read_text())["offset"]
    sr = 8000
    mix, _ = load_mix(44100)
    a = _resample(mix[: 44100 * 40], 44100, sr)
    s = None
    for name in ("vocals", "no_vocals"):
        y, r = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
        y = _resample(y.mean(axis=1)[: r * 40], r, sr)
        s = y if s is None else s[: len(y)] + y[: len(s)]
    n = min(len(a), len(s))
    a, s = a[:n], s[:n]
    lags = np.arange(-400, 401)  # +-50 ms at 8 kHz
    c = [np.dot(a[max(0, -l): n - max(0, l)], s[max(0, l): n - max(0, -l)]) for l in lags]
    lag = int(lags[int(np.argmax(c))])
    off = lag / sr
    cache.write_text(json.dumps({"offset": off, "note": "stem[t + offset] == mix[t]"}))
    return off


def load_stem(name: str, sr: int = 44100, mono: bool = True):
    y, r = sf.read(STEMS / f"{name}.wav", dtype="float32", always_2d=True)
    y = y.mean(axis=1) if mono else y.T
    y = _resample(y, r, sr) if mono else np.stack([_resample(c, r, sr) for c in y])
    k = int(round(stem_offset() * sr))
    if k > 0:
        y = y[..., k:]
    elif k < 0:
        y = np.concatenate([np.zeros(y.shape[:-1] + (-k,), y.dtype), y], axis=-1)
    return y, sr


# ---------------------------------------------------------------------------
# Lyrics parsing

SECTION_RE = re.compile(r"^\[(.+?)\]\s*$")


def section_id(title: str, counts: dict) -> str:
    base = title.lower()
    base = re.sub(r"[—–-].*$", "", base).strip()  # "Bridge — Half-Time" -> "bridge"
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    base = {"pre-chorus": "pre", "final-chorus": "final"}.get(base, base)
    base = re.sub(r"-\d+$", "", base)
    counts[base] = counts.get(base, 0) + 1
    return f"{base}{counts[base]}"


def spoken_form(word: str) -> str:
    """Letters the acoustic model should hear for a printed word."""
    w = word.lower()
    special = {"ffmpeg": "effempeg"}
    w = special.get(re.sub(r"[^a-z]", "", w), w)
    return re.sub(r"[^a-z']", "", w)


def parse_lyrics():
    """-> list of lines: {section, title, index, text, words: [{text, spoken}]}.
    Printed words keep their punctuation; an em dash splits two words
    ("oracle—check") and stays attached to the first."""
    lines, counts, sec, title = [], {}, None, None
    for raw in LYRICS_TXT.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s:
            continue
        m = SECTION_RE.match(s)
        if m:
            title = m.group(1).strip()
            sec = section_id(title, counts)
            continue
        text = re.sub(r"\s+", " ", s)
        toks = []
        for t in text.replace("—", "— ").split():
            sp = spoken_form(t)
            if sp:
                toks.append({"text": t, "spoken": sp})
        lines.append({"section": sec, "title": title, "index": len(lines), "text": text, "words": toks})
    return lines
