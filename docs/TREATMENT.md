# Call in Opus — visual treatment

A code-rendered music video for *Call in Opus* (`audio/song.mp3`, 2:50, lyrics in
`lyrics/lyrics.txt`). Every frame is a deterministic function of song time, so the browser
preview and the offline render always produce the same frame for the same time.

## Concept: the caret

The whole video has one recurring motif: **the caret**, the blinking text cursor that waits
for a prompt. It is a thin bar of ember light. It is always the same object, and in each
scene it takes on that scene's capability. By the end it is the spine of everything that
was built. Then it blinks again on an empty line, ready for the next prompt.

The song is about what the model can do, so every scene is about one capability. The caret
is what does the work in each of them:

| caret becomes… | capability |
|---|---|
| a **cursor** typing the prompt | turning vague ideas into finished artifacts (the start of every job) |
| a **reading line** sweeping a wall of pages | reading and understanding large amounts of context |
| a **probe** sweeping parts, tagging PASS / FAIL | testing and revising its own output |
| a **scan plane** making one more pass | testing and revising its own output |
| a **needle / plotting pen** | analyzing documents, data, images and audio |
| a **cursor inside code**, stepping and breaking | writing and debugging code |
| a **pointer probing boundaries** | finding edge cases |
| a **connector** plugging into tool sockets | using tools |
| a **branch point** of a plan | planning complex work |
| a **balance beam** between sources | researching and comparing evidence |
| the **spine** of a tower | building complete working systems |

It grows as the song does. It is small and blinking in verse 1, a line across a whole wall
in the pre-chorus, and a pillar through the frame from the first chorus on. In the final
chorus it is the axis of the finished machine. In the outro it shrinks back to a
cursor on an empty line ("Build something more").

## Style bible

**Palette** (`app/src/engine/palette.ts`). The ground is dark and cool, and there is one warm
accent. The accent always means "the model is acting here".

| token | hex | use |
|---|---|---|
| ink | `#07090f` | background, blue-black |
| inkLift | `#0f1522` | parts, panels |
| graphite | `#2a3140` | grids, unread pages, inactive structure |
| slate | `#5d6778` | wireframes, secondary type |
| paper | `#ece5d8` | sung words, documents, settled things |
| **ember** | `#ff7a45` | **the caret**, the word being sung, work in progress |
| cyan | `#4fd6e0` | tools, signals, data |
| pass | `#7ee0a1` | verified, tests passing |
| fail | `#ff4d5e` | bugs, edge cases, failing tests |

Ember is the only saturated warm colour. Anything ember is either the caret or has just
been touched by it.

**Typography**
- *Space Grotesk* (300–700): lyrics and display words.
- *JetBrains Mono*: machine text such as tags, metrics, code and labels.
- *Instrument Serif Italic*: vague, human or uncertain words ("aim", "difficult", later
  "uncertainty").

Each font's job is fixed. A word changes font when its meaning changes: the vague serif
*difficult* becomes crisp once it is named.

**Finish.** HDR scene into bloom (dual-filter chain), with a filmic tone curve, ink-blue shadows,
warm halation, beat-driven chromatic fringe, vignette and per-frame hashed film grain
(`app/src/engine/post.ts`). Motion blur is optional in the offline render (`--samples`).

## Lyrics as part of the picture (no subtitles)

Every lyric word is a textured plane in the 3D scene. It has perspective and depth, it
blooms, and it moves with the camera. The same karaoke grammar holds everywhere:

1. **Not yet sung:** nothing is on screen. The caret types the word on at the word's
   onset, over min(word length, 0.28 s).
2. **Being sung:** ember and glowing (HDR, so it blooms).
3. **Sung:** it settles to paper over 0.35 s.

Beyond that, words do things in the scene rather than sitting in a caption strip:
- "multiply" multiplies across the wall.
- CONTEXT is written across the whole wall.
- "aim" is written on the reticle.
- "difficult" is a doubled, vague word that snaps into focus on "name".
- "reason / write / build" label the layers they create.
- PASS / FAIL, latency and code are all machine text in the world.

The running line of the current lyric sits in the scene too: as the prompt at the back of
the plan, in front of the wall, or at the foot of the artifact. It is always typed by the
caret and never shown as an overlay.

## Timing sources

All timing comes from the analysis (`analysis/`, `data/`):

- **Tempo** drifts from 132.1 to 135.3 BPM across the song, so the beat grid is variable.
  It is tracked, snapped to onsets and smoothed. The app interpolates the beat and bar
  arrays; it never assumes a fixed period.
- **Bars and sections:** 95 bars. Sections are snapped to downbeats. A pickup of up to 2.5
  beats stays in the previous section, which is why the choruses land on "OPUS".
- **Stops:** there are 4 spots where the band drops out: 23.9, 37.6, 80.4 and 119.1 s.
  "Call in" before chorus 1 is the first. Stops are cut to black with only the caret.
- **Energy rises** (for example the build at 21.0 s) drive camera pushes and bloom.
- **Words:** each has a start, an end and a confidence. The pulses come from
  kick / snare / hat / vocal onsets.

## Scene plan (whole song)

Times are from `data/audio.json` and `data/lyrics.json` (seconds). **Bold** scenes are
built for the proof of concept. The others play as *draft* scenes for now: the caret types
the lyrics into space, and the preview HUD names the planned capability. The table quotes
the first line of each stretch from `lyrics/lyrics.txt`.

| time | section | scene | capability | idea |
|---|---|---|---|---|
| 0.0–7.3 | intro, verse 1 a | `repo` | reading context · writing & debugging code | A repo tree unfolds as the caret types "Drop the repo, name the goal". The caret walks the file tree (maps the moving whole), reads docs in a column that scrolls, and "finds the bug behind the break": the caret stops on one red line and the code splits open there. |
| **7.3–14.9** | verse 1 b | **`system`** | **building complete systems · testing & revising** | A blueprint seen from 3/4 above. Modules sketch in as wireframes ("Draft the system"). The caret drops in as a probe: PASS, PASS, FAIL ("test the claim"). The parts refactor into a clean layout while the aim reticle stays put. A fill wave makes them live and signals run on the 8ths. "One more pass" is a scan, and on "optimize" the parts pack into a block while p95 latency counts down 212 → 38 ms. |
| **14.9–23.5** | pre-chorus 1 (transition) | **`context`** | **reading large amounts of context** | The packed block tilts up into pages. "parts" splits it into 24, and "multiply" goes ×4 on every beat to 1 536 pages as the camera pulls back and the word tiles itself. On "Give it context" the caret turns horizontal and reads down the wall; relevant pages stay lit, and CONTEXT is written across the wall. In the build (the band returns at 21.0 s) the wall is drawn into the caret. |
| **23.5–31.0** | chorus 1 a | **`artifact`** | **turning vague ideas into finished artifacts** | The stop is a black frame, and the caret types CALL IN. On the "OPUS" downbeat there is a flash, the caret becomes a spine and a vague cloud bursts out. "difficult" floats in the cloud as doubled serif ghosts, which snap into one bracketed word on "name". Then *reason* snaps in a ring graph, *write* wraps the spine in code lines and *build* locks slabs into a tower. "Then inspect" runs a scan up the tower. |
| 31.0–46.0 | chorus 1 b, break 1 | `toolbelt` | using tools | The caret plugs into a ring of tool sockets (search, run, read, plot, render), one per beat. "Give it time" becomes a clock of 16ths. "From the prompt to production" is a conveyor from a prompt box to a deployed box. "One verified step at a time" turns each step green on a downbeat. |
| 46.0–53.0 | verse 2 a | `lab` | analyzing documents, data, images, audio · finding edge cases | "Parse the paper" draws a PDF column into highlights. "plot the trend" has the caret draw a curve as a pen. "Catch the edge case at the end": the caret runs to the boundary of a shape and one red point appears at the edge. "shape the screen" builds a UI wireframe, and "the vague" becomes something seen. |
| 53.0–59.8 | verse 2 b | `pipeline` | using tools · building systems | The video pipeline itself: a beat grid, lyric bars, shader tiles, then headless Chrome → frames → ffmpeg as a literal flow. "Render while the fans complain" shows a frame counter and a spinning fan glyph. |
| 59.8–66.4 | pre-chorus 2 | `evidence` | researching and comparing evidence | "Not an oracle": the caret splits into two balance points over sources that disagree. "check the source" draws a citation line back to a document. "Human hands still set the course": the caret waits, and a human cursor (a second, paper-coloured caret) sets the heading. |
| 66.4–83.5 | chorus 2 | `artifact-2` | vague → finished artifacts | A reprise of chorus 1 with the artifact already standing. Each line adds a floor and the tower grows taller. The stop at 80.4 s is black with only the caret. |
| 83.5–92.3 | break 2, bridge a | `loop` | planning · writing & debugging | Half-time. "Read it / Map it / Plan it / Make it / Run it / Break it / Trace it / Change it": eight nodes on a loop, one per word, with the caret stepping around it. On "Break it" the loop cracks red, and on "Change it" it heals. |
| 92.3–95.8 | bridge b | `views` | researching and comparing evidence | "Search the evidence / Compare the views": two columns of sources. "State uncertainty" shows an error bar that is honest, in serif italic. "Then choose" is a single ember decision line. |
| 95.8–117.3 | bridge c, break 3 | `senses` | analyzing text, images, sound, code | "Text or image / Sound or code": four panels (glyphs, pixels, waveform, code), each lit by the caret. "Keep the context / Hold the goal" gathers them into one frame. The 16-bar instrumental break is a slow flight through everything built so far. |
| 117.3–132.0 | final chorus a | `machine` | building complete working systems | "Let the whole machine ignite": every earlier scene's structure lights up around the spine at once. "From the first unfinished question / To a system running right" runs as a time-lapse from the empty caret to a running machine. |
| 132.0–147.5 | final chorus b | `world` | testing and revising | "Every layer, every frame": the scan runs through all layers. "You decide what world to make" pulls the camera back to reveal a human cursor at the controls. The long held "time" at 138–146 s counts verified steps. |
| 147.5–170.0 | outro | `door` | vague → artifacts | "Name the goal / Open the door" has the caret draw a doorway of light. The last "Call in Opus" is quiet, the machine folds back into the caret, and "Build something more" leaves one blinking caret on an empty line to the end. |

## Proof of concept (built)

- **Window:** 11.03–29.95 s (18.9 s), from the beat before "From a sketch" to the downbeat
  after "…and build it".
- **Content:** the end of the verse (`system`), the whole pre-chorus and build as the
  transition (`context`), and the first three chorus lines (`artifact`).
- **Rendering:** `bun scripts/render.ts video --poc --fade` renders it. `?poc=1` loops it in
  the preview.

## Open questions (need a decision)

1. **Palette and motif.** Ember caret on blue-black, with cyan / green / red as functional
   colours only. Approve or redirect before the remaining scenes are built.
2. **Format.** 16:9 at 1920×1080, 60 fps (4K with `--scale 2`). A vertical 9:16 cut would
   need its own camera framing per scene.
3. **"Opus" in type.** The name is set in the video's own display face (Space Grotesk, caps).
   No logos or brand marks are used.
4. **Rendering hardware.** The cloud container has no GPU, so frames render on SwiftShader
   (CPU) at about 1 s per frame. The full song at 60 fps would take about 3 hours here, or
   minutes on a machine with a GPU. Motion blur (`--samples 4+`) multiplies that.
5. **Outro word timing.** The outro and a few chorus pickups are low-confidence in the
   alignment. Whisper disagrees on "Open the door" and the last "Call in Opus". They need a
   manual check before those scenes are built. The PoC stretch was checked against the
   spectrogram (`analysis/qa/window_7_19.png`, `window_18_31.png`).
