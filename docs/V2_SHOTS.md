# V2 shot bible: proof of concept, 11.033–29.958 s

V1 proved the pipeline. V2 is directed: every shot below is decided (focal point, hierarchy,
shape, space, lyric placement, motion, transitions, feeling) before it is built. Every shot
then passes three stages: an art-directed still, a motion test, and the integrated render.

Timing: impacts use the measured vocal onsets in `data/hero_onsets.json` (not beats, not
CTC boundaries). Section shape: verse 1 ends at 15.0, the band drops out at 15.7, returns
at 20.985 for the build, stops at 23.90, and lands on the downbeat at 24.582.

## System

**Editorial grid.** 1920×1080 logical frame. Outer margins are 96 px left/right and 72 px
top/bottom. There are 12 columns (126 px wide, 24 px gutters) on a 24 px baseline grid.
Hero words set their baseline on a grid line and their left edge on a column edge. Micro
annotations hang from the baseline of their hero word, 24 px below it, left-aligned with
it.

**Type.** All display type is real glyph outlines (opentype.js: kerning from the font's
GPOS/kern tables, then manual per-pair and tracking adjustments per shot), built as
geometry. It is never a browser text box.

| role | face | use |
|---|---|---|
| hero | Instrument Sans, wdth 75–100, wght 500–700 | the words that become images; width and weight are animated variables (instances are point-compatible and morphed) |
| human / uncertain | Instrument Serif Italic | "difficult": vague things, until they are named |
| machine | JetBrains Mono 500 / 700 | annotations, counters, code; never smaller than 48 px when it carries meaning, 28–32 px only for micro detail that rewards close inspection |

Normal lyrics do not glow. Glow is reserved for the cursor (ember) and for verified signal
(mint).

**Materials.** One key light (upper left, warm, soft through temporal jitter of its
direction), one cool rim (back right), shadow-mapped contact shadows, and height-based
occlusion where objects meet the ground.

| material | look |
|---|---|
| graphite | matte, slightly granular, the ground and structure; darkness keeps visible form |
| porcelain | typography: off-white `#EEE9DF`, wrap-lit, crisp bevel highlight |
| reasoning | translucent blue `#5FA8FF`, additive tubes and paths |
| mint | verification pulses `#7CF2C2`, emissive |
| ember | the cursor `#FF6A3D`, emissive |
| metal | brushed highlights, only on completed machinery (shot 9) |

**The cursor gains a notch for every capability it shows.** Micro detail: a thin tick on
its right side. Reading the PoC left to right it becomes drafting pen → pass →
reader → trier → the I of IN → typing caret → probe → spine. At the end it carries five
notches.

**Motion vocabulary.**

| motion | used for |
|---|---|
| `outExpo` | assembly and reveals |
| `inExpo` | anything pulled into the cursor |
| `inOutCubic` | deliberate camera travel |
| critically damped springs | mechanical locking |
| stepped | machine states and counters |
| hard cuts | CALL, IN, OPUS |
| match cuts | conceptual transformations |

No orbiting, drift or random shake. The camera moves only when a lyric motivates it, and
holds otherwise. There is stillness before every impact.

**Depth.** Foreground carries speed and transitions (the pulse, the pass, the collapsing
rails). Midground carries the action (the hero word and its system). Background carries
context (graphite ground, receding strata). Depth of field only in shot 8, as a rack
focus on "name".

## Shots

### 1 · LIVE (11.033–13.250) — building a working system from a sketch

- **Focal point:** the word LIVE. It is all straight strokes, which lets a drawing become an
  object.
- **Hierarchy:** LIVE (cap height 380 px) → construction geometry → title block "From a sketch
  to something" (56 px, mono, on the drawing's baseline rule) → dimension annotations (30 px).
- **Dominant shape:** four vertical stems and a V's diagonal, standing on a long horizontal
  baseline rule.
- **Negative space:** the right 40% is empty ground, where the current will run out of
  frame. Left edge on column 2.
- **Lyric placement:** "From a sketch to something" is typed by the cursor as the drawing's
  title block along the baseline rule. LIVE *is* the lyric "live".
- **Motion:** the cursor draws construction lines left→right as a pen: baseline, cap line,
  stem axes and the V's diagonal, each an `outExpo` stroke on the 8ths. On "sketch"
  (11.900) the stems exist only as graphite outlines. On "something" (12.240) they extrude
  to porcelain solids (`outExpo`, 180 ms, staggered by letter). On "live" (12.681) comes
  the impact: a mint current enters the foot of the L and runs the letters as one
  continuous circuit L→I→V→E in 220 ms. The letters compress 3% and recover (spring). The
  camera holds; one short motivated push-in (inOutCubic, 0.5 s) follows the current.
- **Entry:** fade from black is avoided. The PoC opens on the construction baseline already
  drawn, the cursor at its left end.
- **Exit:** the current leaves the E's middle arm as a single mint line. The camera whips
  right with it (motivated by the pulse, inOutCubic 220 ms) into shot 2.
- **Emotion:** precise, calm → the click of something switching on.
- **Macro / meso / micro:**
  - macro: LIVE
  - meso: the construction lines and the current path
  - micro: dimension ticks such as `cap 380`, `stem 58`, and the drawing number `DWG-011`

### 2 · OPTIMIZE (13.250–15.040) — testing and revising its own output

- **Focal point:** the word OPTIMIZE locking onto a straight line.
- **Hierarchy:**
  1. OPTIMIZE: 250 px when locked
  2. the path
  3. the counter `412 ms → 38 ms` (56 px, mono, stepped)
  4. hop marks (30 px)
- **Dominant shape:** one horizontal line through the frame at the lower third.
- **Negative space:** the upper half is open and still. All action happens on one line.
- **Lyric placement:** the letters of OPTIMIZE ride the path's segments, one letter per
  segment, widely spread (tracking +900). When the path straightens they slide into
  optical kerning, and their width morphs from 100 to 75 (condensed = optimized). "One more
  pass," is typed small above the path's start (56 px).
- **Motion:** the current arrives as a wasteful routed path: 11 right-angle detours, drawn in
  stepped increments (a machine trace). "pass" (13.689): the cursor anticipates, pulling back
  60 px over 120 ms. Then it runs the path end to end (inExpo → outExpo, 300 ms), striking
  each detour with a mint tick. "then" (13.96): stillness. "optimize" (14.100): every detour
  collapses into the straight line at once (critically damped spring, slight overshoot), and
  the letters gather tight. The counter steps down `412 → 311 → 190 → 96 → 38`.
- **Entry:** match on the moving current from shot 1.
- **Exit:** OPTIMIZE lifts off the line (inExpo, up and out of frame). The line stays and
  shortens to the width of "hard parts" as the next line is typed above it. The line
  *becomes the underline*.
- **Emotion:** impatience → satisfaction; the frame literally gets tidier.

### 3 · MULTIPLY (15.040–18.620) — reading large amounts of context

- **Focal point:** MULTIPLY in depth. Every glyph trails a stack of receding copies, like
  strata.
- **Hierarchy:**
  1. MULTIPLY: 300 px front layer
  2. the stack of underlined document lines receding in depth
  3. "When the hard parts" (140 px)
  4. layer counter `×1 ×2 ×4 … ×64` (mono 48 px)
- **Dominant shape:** a wedge. Parallel horizontal strata converge to a vanishing point
  right of centre.
- **Negative space:** the top 30% holds dark air above the strata. The band has dropped
  out, and the frame is allowed to breathe.
- **Lyric placement:** "When the hard parts" sits on the underline carried from shot 2.
  "hard parts" is underlined. On "parts" (15.951) the underline breaks into three segments
  (the parts). MULTIPLY is set on the same baseline, replacing the phrase as the word is
  sung.
- **Motion:** on "multiply" (16.348) and then on every beat of the held note, the layers
  double: 1→2→4→8→16→32→64. Each new copy is born from its parent and slides back in z with
  `outExpo`, while the counter steps. Between beats the frame is still. At the end of the
  held note (18.2) the camera rises and pulls back (inOutCubic, 0.9 s) to reveal the depth.
  This is the only camera move, motivated by the growth.
- **Entry:** the underline from shot 2.
- **Exit:** all underlines fold up at both ends (hinged 90°, springs) into two vertical rails.
  The strata become a stack of rungs between them, and *the underline folds into a
  context-window boundary*.
- **Emotion:** vertigo, the sheer amount of it.

### 4 · CONTEXT (18.620–23.611) — reading and understanding context; trying

- **Focal point:** CONTEXT, set to exactly the inner width of the window.
- **Hierarchy:**
  1. CONTEXT: 330 px
  2. the window boundary (porcelain rails with corner registration marks)
  3. the compressed strata inside (graphite hairlines, the document reduced to texture)
  4. the cursor and its output line "let it try" (56 px mono)
  5. micro: `lines in view 1,536`
- **Dominant shape:** one tall vertical rectangle, centred, occupying the middle 5 columns.
- **Negative space:** symmetrical dark margins on both sides. They are the point: the
  context is *contained*.
- **Lyric placement:**
  - "Give it" is typed at the top-left inside the window (56 px mono).
  - CONTEXT fills the window width and is itself read: a reading line (the cursor turned
    horizontal) passes down through it on "context," (19.042).
  - "let it try" is the first line of the cursor's own output, typed at the bottom of the
    window.
- **Motion:** "Give it" (18.68): the strata are pulled into the window (inExpo, 350 ms),
  compressing into hairlines. "context," (19.042): CONTEXT slams in (outExpo, 160 ms,
  2% overshoot), and the reading line sweeps down it (320 ms). "try" (20.491): the
  cursor takes one stepped move up, leaving a mint tick: a first attempt. Build (20.985 →):
  the rails move inward on every 8th note (inExpo per step, accelerating), squeezing the
  window. By 23.55 it has collapsed into a single vertical stroke at x = 1180 px, dead
  still for 60 ms.
- **Entry:** the rails folded up in shot 3.
- **Exit:** the vertical stroke. It carries across the hard cut into CALL and becomes the
  I of IN.
- **Emotion:** focus → pressure → held breath.

### 5 · CALL (23.611–24.113) — chorus impact 1

- **Focal point:** CALL, cap height 560 px (1.5× the verse hero), porcelain slabs standing
  on graphite.
- **Hierarchy:** CALL alone. The vertical stroke from shot 4 stands to its right. Nothing
  else. There is no lyric line; the word is the lyric.
- **Dominant shape:** four massive block letters, left-weighted on columns 1–8.
- **Negative space:** the right third is black except for the stroke. The band stops at
  23.90, so the frame goes quieter still: the ground light dims to near black.
- **Motion:** hard cut at 23.611. The letters arrive already in place; the impact is a
  1.5% scale compression and recovery (spring, 140 ms) and a key-light flare on the
  bevels. Then a still hold.
- **Emotion:** a summons.

### 6 · IN (24.113–24.417) — chorus impact 2

- **Focal point:** the I, which *is* the cursor (ember, emissive, the only light source in
  frame), with the N in porcelain beside it. Cap height 900 px, cropped top and bottom by
  the frame.
- **Dominant shape:** two verticals and a diagonal filling the frame. This is the largest
  scale in the PoC.
- **Motion:** hard cut at 24.113 (match: the stroke from shots 4–5 is the I). The camera is
  close, low and wide; real depth comes from the N's extrusion receding. A 300 ms hold; the
  I brightens toward the next cut.
- **Emotion:** the cursor is inside the word, the model is being called in.

### 7 · OPUS (24.417–25.800) — chorus impact 3, the reveal

- **Focal point:** OPUS across the full width, cap height 470 px. Then the O's counter.
- **Motion:**
  - 24.417, hard cut: OPUS lands.
  - 24.582, band downbeat: the O's inner contour begins to open outward (outExpo).
  - 24.80, "-pus" plosive: P-U-S kick back 4% in z (impact).
  - 24.85–25.40: the camera travels *through the O* (inOutCubic). The O's inner edge
    becomes the ring that frames the reasoning space.
  
  Only after OPUS is the system revealed: blue reasoning paths inside.
- **Emotion:** arrival, scale, the sense that there is a whole machine behind the name.

### 8 · DIFFICULT / NAME (25.800–27.600) — naming the hard problem

- **Focal point:** the word *difficult* (Instrument Serif Italic, 260 px), out of focus and
  tangled among translucent blue paths.
- **Hierarchy:**
  1. *difficult*
  2. the knot of reasoning paths
  3. "Give the … a" in mono 56 px along the ring
  4. the name bracket
- **Dominant shape:** a tight knot at centre, framed by the O-ring.
- **Motion:** "difficult" (26.218): the word emerges inside the knot, soft (depth of field
  focused behind it). "name" (27.086): a rack focus lands on the word (inOutCubic,
  220 ms), four porcelain corner brackets lock onto it (critically damped), and the paths
  nearest the word straighten slightly: the problem is named.
- **Emotion:** confusion → grip.

### 9 · REASON / WRITE / BUILD (27.600–29.958) — reasoning, writing, building

- **Focal point:** one blue path pulled taut into a straight line, which becomes a line of
  code, which folds up into a machine standing on the ground.
- **Motion and lyric:**
  - "reason," (28.106): one path pulls out of the knot and straightens (spring) into a
    horizontal line across the frame. REASON rides it for a beat (180 px).
  - "write," (28.460): the line becomes a line of code, typed along it (mono 64 px):
    `name(difficult).solve()`.
  - "build" (29.027): the code line's tokens fold up 90° one per 16th (hinged springs)
    into the plates of a machine (graphite with brushed metal edges).
  - 29.30–29.958: a mint verification pulse runs through the machine and exits into the
    cursor, which stands as the machine's spine and gains its fifth notch. The PoC ends
    on the downbeat 29.958 with a readable hold.
- **Emotion:** momentum → a finished, verified thing.

## Style frames (4K)

Six style frames, one per stage of the story:

| # | time | shot | what the frame shows |
|---|---|---|---|
| 1 | 12.95 | LIVE | lit by the current |
| 2 | 14.60 | OPTIMIZE | locked on the straight line |
| 3 | 18.05 | MULTIPLY | ×64 in depth |
| 4 | 19.55 | CONTEXT | the window with the reading line through it |
| 5 | 24.50 | OPUS | landed |
| 6 | 29.70 | BUILD | the machine with the verification pulse |

## Scoring

Scoring per deliverable, 1–10, minimum 8 in every category:

- composition
- typography
- lyric integration
- motion
- musical sync
- storytelling
- originality
- technical quality

Scores and the revisions they forced are logged in `docs/V2_QC.md`.
