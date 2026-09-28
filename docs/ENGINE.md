# Engine and scene API

`app/` is a TypeScript + three.js renderer, served by Vite and run with bun.

## Determinism

`Engine.render(t, frame)` draws the frame for song time `t`:

- No scene keeps state between frames.
- `Math.random` is never used; `engine/util.ts` has integer hashes and value noise instead.
- All animation reads `t` through `Music` (`engine/data.ts`): beat and bar position,
  envelopes, onset pulses and word states.

`frame` only seeds the film grain. The preview renders at the Web Audio clock. The
export asks for exact times `f / fps`. Seeking, looping and rendering all give the same
picture for the same `t`.

## Data (`data/`, produced by `analysis/`)

- `audio.json` holds:
  - `beats` and `downbeats`: a variable grid, because the tempo drifts 132 → 135 BPM.
  - `sections`.
  - `bar_energy` and `energy_events`.
  - `stops`: where the band drops out.
  - `env`: 100 fps envelopes for `rms low mid high vocal band`.
  - `onsets`: `kick snare hat vocal`, each `[t, strength]`.
- `lyrics.json` holds lines, each with `section`, `start`, `end` and
  `words[{text, start, end, conf}]`.

`Music` wraps these:

| method | returns |
|---|---|
| `beat(t)`, `barPos(t)` | continuous position on the grid |
| `beatTime(k)`, `downbeat(k)` | the inverse: time of beat or bar `k` |
| `beatPulse(t, decay)`, `barPulse(t, decay)` | exponential pulses on the grid |
| `pulse('kick' \| 'snare' \| 'hat' \| 'vocal', t, decay)` | pulses from detected onsets |
| `env(name, t)` | interpolated envelope value |
| `wordState(word, t)` | `{on, active, sung, p, hit}` |

## Scenes (`src/scenes/`, `src/engine/scene.ts`)

A scene subclasses `Scene`, owns a `THREE.Group`, and implements:

- `build()`: runs once and creates meshes.
- `update(frame)`: sets every transform and uniform from `frame.t`. It also sets
  `frame.cam` and adjusts `frame.post` (bloom, fringe, flash, exposure…).

Scenes whose windows overlap are all updated. The one with the highest `priority` sets
the camera last.

The timeline (`src/timeline.ts`) builds the windows from the lyric lines and the beat
grid. Re-running the analysis re-times the video.

## Building blocks

- **`TextMesh`** (`engine/type.ts`): a word as a world-space plane. It has a cached
  Canvas2D glyph texture and a shader with `color`, `opacity`, `reveal` (type-on),
  `glow` (HDR boost into bloom) and `lift`.
- **`LyricLine`** (`engine/lyricline.ts`): a lyric line laid out as `TextMesh` words, with
  the shared karaoke grammar (typed on at onset, ember while sung, paper after). It
  returns the caret position.
- **`Caret`** (`engine/motif.ts`): the recurring motif, a core bar, a glow and a trail.
  `pose()` sets position, height, width, rotation, intensity and colour. `blink()` is a
  cursor blink locked to the beat.
- **`Post`** (`engine/post.ts`): an MSAA HDR target, a 5-level dual-filter bloom, and a
  composite pass (filmic curve, grade, fringe, halation, vignette, grain).

## Offline render (`app/scripts/render.ts`)

The script works as follows:

1. It starts a private Vite server with HMR disabled.
2. It opens the app in headless Chromium with `?export=1`. It prefers Playwright's
   Chromium, or `$CHROME_PATH`.
3. The page renders exact frames and streams raw RGBA over a WebSocket, with at most 3
   frames in flight.
4. Bun pipes the frames into ffmpeg, which runs `vflip`, libx264 (CRF 16, `-tune grain`)
   and AAC 320k.

Audio is cut from `audio/song.mp3` with the same `from`/`to`.

```sh
cd app
bun scripts/render.ts video --poc --fade                  # proof of concept -> out/poc.mp4
bun scripts/render.ts video --from 0 --to 170 --samples 4  # full song with motion blur
bun scripts/render.ts sheet --poc --n 20                   # contact sheet
bun scripts/render.ts stills --t 24.6,28.5                 # PNG stills
bun scripts/render.ts perf --poc                           # ms per frame
```

`--samples N` averages N sub-frames over `--shutter` × frame time (motion blur).

`--gl` picks the WebGL backend:

- Linux without a GPU: `angle=swiftshader` (default), about 1 s per 1080p frame.
- macOS: `angle=metal` (default).
- A GPU on Linux: `angle=vulkan` or `angle=gl`.
