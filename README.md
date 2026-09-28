# opusvideo — *Call in Opus* music video

A code-rendered music video for *Call in Opus* (`audio/song.mp3`, lyrics in `lyrics/lyrics.txt`),
with word-synced typography that lives inside the scenes. Every frame is a deterministic
function of song time, so the browser preview and the offline render (headless Chrome →
ffmpeg) produce the same frames. The production workflow follows
[mexicat/pdoom-video](https://github.com/mexicat/pdoom-video); the code, concept and visuals
here are new.

- Concept, style bible and the scene-by-scene plan: [`docs/TREATMENT.md`](docs/TREATMENT.md)
- Engine, scene API and renderer: [`docs/ENGINE.md`](docs/ENGINE.md)

**Status:** the analysis covers the whole song. A 19-second proof of concept
(verse → pre-chorus transition → chorus, 11.0–29.9 s) is built and rendered. The other
sections play as draft scenes.

## Layout

- `audio/song.mp3`: the song. `lyrics/lyrics.txt`: the lyric sheet.
- `analysis/`: Python (uv) tools that produce the timing data.
  - `align.py`: Demucs vocal stem → MMS CTC forced alignment, cross-checked against Whisper.
  - `analyze.py`: variable-tempo beat grid, downbeats, sections, stops, energy, onsets.
  - `qa_plot.py`, `qa_grid.py`: QA plots and checks.
- `data/lyrics.json`: word-level lyric timings with confidences.
- `data/audio.json`: beats, downbeats, sections, stops, energy events, envelopes and onsets.
- `app/`: the renderer (TypeScript + three.js, bun + Vite).
  - `src/engine/`: data queries, typography, the caret motif, post-processing and the engine.
  - `src/scenes/`: `system`, `context` and `artifact` (the PoC), plus `draft` for unbuilt sections.
  - `src/timeline.ts`: scene windows anchored to lyric lines and the beat grid.
  - `scripts/render.ts`: the offline renderer.
- `docs/poc/poc.mp4`: the proof-of-concept render.
- `out/`: renders (not committed).

## Preview

```sh
cd app
bun install
bunx vite            # http://localhost:5173
```

URL parameters:

- `?poc=1` loops the proof of concept.
- `?t=24` starts at 24 s.
- `&scale=2` renders at 4K.

| key | action |
|---|---|
| space | play / pause |
| ← / → | seek ±1 s (±5 s with shift) |
| `,` / `.` | step one frame |
| `[` / `]` | previous / next scene |
| `l` | loop the proof of concept |
| `h` | hide the UI |

## Render

Needs ffmpeg with libx264, plus Chrome or Chromium: Playwright's, or `$CHROME_PATH`.

```sh
cd app
bun scripts/render.ts video --poc --fade                       # -> out/poc.mp4
bun scripts/render.ts video --from 0 --to 170 --samples 4      # full song, motion blur
```

## Regenerate the timing data

```sh
cd analysis
uv sync
uv run python -m demucs -n htdemucs --two-stems vocals -o stems ../audio/song.mp3
uv run python align.py        # data/lyrics.json (downloads MMS_FA + whisper small.en)
uv run python analyze.py      # data/audio.json
uv run python qa_plot.py 18 31
```

The stems, the model weights (`analysis/.cache/`) and intermediates (`analysis/work/`) are
not committed.

## Credits

- **Song:** *Call in Opus* ("made with suno"), `audio/song.mp3` and `lyrics/lyrics.txt`,
  supplied by the repository owner.
- **Fonts:** Space Grotesk, JetBrains Mono and Instrument Serif, all under the SIL Open Font
  License, via Fontsource.
