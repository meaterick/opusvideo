"""Word-level lyric alignment -> data/lyrics.json

Pipeline
  1. Demucs (htdemucs, two stems) isolates the vocal: stems/htdemucs/song/vocals.wav
  2. CTC emissions of the vocal stem from torchaudio's MMS_FA model (16 kHz,
     20 ms frames), computed in overlapping 30 s windows.
  3. One global CTC forced alignment of the whole lyric sheet, with a "*"
     (garbage) token between lines so instrumental gaps and ad-libs are
     absorbed instead of stretching words.
  4. Cross-check against faster-whisper word timestamps (independent model):
     words are matched by text, and the start-time disagreement feeds the
     per-word confidence.  Large disagreements are listed in the report.
  5. Word ends are tidied: a word ends where the next one starts when the gap
     is < 120 ms (legato singing), and never runs past the next word.

Run:  uv run python align.py [--no-whisper]
"""
from __future__ import annotations

import json
import sys
from difflib import SequenceMatcher

import numpy as np
import torch
import torchaudio

import common

SR = 16000
FRAME = 320 / SR  # MMS_FA frame hop: 20 ms


def emissions(wave: torch.Tensor, model, win_s=30.0, ctx_s=3.0) -> torch.Tensor:
    """Log-prob emissions for a long mono waveform, in windows of win_s with
    ctx_s of context on each side (discarded) so the model sees continuity."""
    win, ctx = int(win_s * SR), int(ctx_s * SR)
    n = wave.shape[1]
    total_frames = n // 320
    out = []
    with torch.inference_mode():
        for a in range(0, n, win):
            s0, s1 = max(0, a - ctx), min(n, a + win + ctx)
            em, _ = model(wave[:, s0:s1])
            em = torch.log_softmax(em, dim=-1)[0]
            f_a = (a - s0) // 320
            f_len = min(win, n - a) // 320
            out.append(em[f_a: f_a + f_len])
            print(f"  emissions {a / SR:6.1f}s .. {min(n, a + win) / SR:6.1f}s", flush=True)
    em = torch.cat(out)
    if em.shape[0] < total_frames:
        em = torch.cat([em, em[-1:].repeat(total_frames - em.shape[0], 1)])
    return em


def ctc_align(lines):
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True)
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()
    voc, _ = common.load_stem("vocals", sr=SR)
    wave = torch.from_numpy(voc.astype(np.float32))[None]
    cache = common.WORK / "mms_emissions.pt"
    if cache.exists():
        em = torch.load(cache)
    else:
        em = emissions(wave, model)
        torch.save(em, cache)
    # transcript: words of every line, "*" before each line and at the end
    words, owner = [], []
    for li, line in enumerate(lines):
        words.append("*")
        owner.append(None)
        for wi, w in enumerate(line["words"]):
            words.append(w["spoken"])
            owner.append((li, wi))
    words.append("*")
    owner.append(None)
    spans = aligner(em, tokenizer(words))
    probs = em.exp()
    result = {}
    for spn, own in zip(spans, owner):
        if own is None:
            continue
        s = spn[0].start * FRAME
        e = spn[-1].end * FRAME
        score = float(np.mean([t.score for t in spn]))
        result[own] = dict(start=s, end=e, ctc=score, chars=[(t.start * FRAME, t.end * FRAME) for t in spn])
    return result, em.shape[0] * FRAME


def whisper_words():
    cache = common.WORK / "whisper_words.json"
    if cache.exists():
        return json.loads(cache.read_text())
    from faster_whisper import WhisperModel
    voc, _ = common.load_stem("vocals", sr=SR)
    model = WhisperModel("small.en", device="cpu", compute_type="int8",
                         download_root=str(common.HERE / ".cache" / "whisper"))
    segs, _ = model.transcribe(voc.astype(np.float32), language="en", word_timestamps=True,
                               vad_filter=False, beam_size=5, condition_on_previous_text=False)
    out = []
    for sg in segs:
        for w in sg.words or []:
            out.append(dict(w=w.word.strip(), start=round(w.start, 3), end=round(w.end, 3), p=round(w.probability, 3)))
        print(f"  whisper {sg.start:6.1f}-{sg.end:6.1f} {sg.text.strip()[:70]}", flush=True)
    cache.write_text(json.dumps(out, indent=0))
    return out


def norm(w: str) -> str:
    return "".join(ch for ch in w.lower() if ch.isalnum())


def match_whisper(flat, wh):
    """Map lyric word index -> whisper word (by text, in order)."""
    a = [norm(f["text"]) for f in flat]
    b = [norm(w["w"]) for w in wh]
    sm = SequenceMatcher(a=a, b=b, autojunk=False)
    m = {}
    for blk in sm.get_matching_blocks():
        for k in range(blk.size):
            m[blk.a + k] = wh[blk.b + k]
    return m


def main():
    use_whisper = "--no-whisper" not in sys.argv
    lines = common.parse_lyrics()
    print(f"{len(lines)} lines, {sum(len(l['words']) for l in lines)} words; stem offset "
          f"{common.stem_offset() * 1000:+.1f} ms")
    ctc, dur = ctc_align(lines)
    flat = [dict(li=li, wi=wi, text=w["text"]) for li, l in enumerate(lines) for wi, w in enumerate(l["words"])]
    wh = whisper_words() if use_whisper else []
    wm = match_whisper(flat, wh) if wh else {}

    # assemble + confidence
    diffs = []
    for k, f in enumerate(flat):
        c = ctc[(f["li"], f["wi"])]
        f.update(start=c["start"], end=c["end"], ctc=c["ctc"])
        w = wm.get(k)
        if w is not None:
            d = c["start"] - w["start"]
            f["whisper_dt"] = d
            diffs.append(abs(d))
        conf = min(1.0, max(0.0, (c["ctc"] - 0.05) / 0.6))
        if "whisper_dt" in f:
            agree = max(0.0, 1.0 - abs(f["whisper_dt"]) / 0.4)
            conf = 0.5 * conf + 0.5 * agree
        else:
            conf *= 0.8
        f["conf"] = round(conf, 3)

    # tidy ends: legato -> end at next start; never overlap
    for k in range(len(flat) - 1):
        a, b = flat[k], flat[k + 1]
        same_line = a["li"] == b["li"]
        if b["start"] - a["end"] < 0.12 and same_line:
            a["end"] = b["start"]
        a["end"] = min(a["end"], b["start"])
        a["end"] = max(a["end"], a["start"] + 0.06)

    out_lines = []
    for li, line in enumerate(lines):
        ws = [f for f in flat if f["li"] == li]
        out_lines.append(dict(
            section=line["section"], title=line["title"], text=line["text"],
            start=round(ws[0]["start"], 3), end=round(ws[-1]["end"], 3),
            words=[dict(text=f["text"], start=round(f["start"], 3), end=round(f["end"], 3), conf=f["conf"])
                   for f in ws]))
    sections = []
    for l in out_lines:
        if not sections or sections[-1]["id"] != l["section"]:
            sections.append(dict(id=l["section"], title=l["title"], start=l["start"], end=l["end"]))
        sections[-1]["end"] = l["end"]
    doc = dict(
        source="lyrics/lyrics.txt",
        duration=round(dur, 3),
        method="torchaudio MMS_FA CTC forced alignment on the Demucs htdemucs vocal stem "
               "(global, star token between lines), cross-checked against faster-whisper small.en "
               "word timestamps. conf = mix of CTC score and whisper agreement (0..1).",
        stats=dict(whisper_matched=len(diffs), words=len(flat),
                   whisper_median_abs_dt=round(float(np.median(diffs)), 3) if diffs else None,
                   whisper_p90_abs_dt=round(float(np.percentile(diffs, 90)), 3) if diffs else None),
        sections=sections, lines=out_lines)
    (common.DATA / "lyrics.json").write_text(json.dumps(doc, indent=1))

    # report
    print(f"\nwrote {common.DATA / 'lyrics.json'}")
    if diffs:
        print(f"whisper agreement: {len(diffs)}/{len(flat)} words matched, median |dt| "
              f"{np.median(diffs) * 1000:.0f} ms, p90 {np.percentile(diffs, 90) * 1000:.0f} ms")
    for l in out_lines:
        low = [w for w in l["words"] if w["conf"] < 0.4]
        flag = f"   low-conf: {' '.join(w['text'] for w in low)}" if low else ""
        print(f"{l['start']:7.2f}-{l['end']:7.2f} [{l['section']:>9}] {l['text']}{flag}")
    big = [f for f in flat if abs(f.get("whisper_dt", 0)) > 0.3]
    if big:
        print("\nwords where CTC and whisper disagree by > 300 ms:")
        for f in big:
            print(f"  L{f['li']:02d} {f['text']:<14} ctc {f['start']:7.2f}  whisper {f['start'] - f['whisper_dt']:7.2f}")


if __name__ == "__main__":
    main()
