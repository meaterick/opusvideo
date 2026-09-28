# V2 quality control log

Every deliverable is reviewed at 100 % (4K crops) and scored 1–10 in eight categories:

- composition
- typography
- lyric integration
- motion
- musical sync
- storytelling
- originality
- technical quality

Nothing proceeds with a category below 8. This log records the scores and the revisions they
forced, in order.

## Stage 0 — engine and pipeline defects found by review

Every defect below was found by looking at a render, then measured before it was fixed.

| # | symptom in the frame | cause (measured) | fix |
|---|---|---|---|
| 1 | Flat grey wall, clipped porcelain, shadow contrast ~1.1:1 | Isolation renders (all lights off still gave wall 71/255). Since three r163, `material.envMapIntensity` does **not** scale `scene.environment`, so the studio environment lit every surface at full strength. | Environment assigned per material. Wall now 12–27, shadows 15, porcelain 204–222. |
| 2 | Internal boxes inside E / L / V outlines | Static instances cut from the variable font keep **overlapping contours**. | Contours are boolean-unioned. |
| 3 | JetBrains Mono "8" rendered solid | The 8 is two **self-intersecting figure-eight contours**. | Contours are split at self-intersections, then filled by the nonzero rule, largest area first. Audit: 6 fonts × 62 glyphs, 0 missing counters. |
| 4 | I and T rendered as wedges | A single-contour glyph skipped polygon-clipping, so `slice(0, -1)` dropped a real corner. | The closing point is dropped only if it is a duplicate. |
| 5 | Depth of field did nothing; frames were shifted | `renderer.autoClear` cleared the float accumulation target before every pass, so an "N-sample" frame was only its **last** sample: no motion blur, DoF, soft shadows or jitter AA. | autoClear off. 1 vs 24 samples now match in brightness (62.5 / 62.3). Edge energy under DoF drops 16.3 → 9.3. |

## Stage 1 — still frames, first review

| shot | first review | revision |
|---|---|---|
| 1 LIVE | Lighting 4, porcelain 5, current 5. The wall was CAD-flat, the letters plastic, and a messy wire ran between letters. | Spot key with falloff. The sketch contours re-light in mint on "live". The practical light switches on at the onset. Baseline raised for optical balance. |
| 2 OPTIMIZE | Unoptimised state 3: letters overlapped at random heights. | The same word, wide and loose, each letter on its own kink, then condensed to w75, tight and on the line. |
| 3 MULTIPLY | Composition 5: a lone line in an empty frame. | Faint document lines: the real "hard parts" of this job (tempo drift, the OPUS onset, the self-crossing 8, …). |
| 4 CONTEXT | Typography 5: "Give it" collided with the C, and the rows read as vertical stripes. | 80 px clearance. Rows thin, staggered and truncated like text lines. Fixed a Ribbon visibility bug (corners never hid). |
| 5 CALL | After the stop, 5: no visible consequence of the band stopping. | The stage key dies and the cursor becomes the light (ember point light, steep falloff). |
| 6 IN | 4: the ember I read as a flat peach slab, with chunky notches. | Hot core in near-black housing, glow from halation only. Notches are fine ticks at any scale. |
| 8 difficult | Rack focus invisible (the engine defect in Stage 0, #5). | Fixed. |
| 9 REASON | 4: REASON collided with *difficult*. | *difficult* is pulled into the code line as its first token (matter carried). |
| 9 BUILD | 6: the machine read as a plinth. | Crane to 3/4 on "build". Blocks keep seams and machined tops, each with a status light switched on by the verification pulse. |

## Stage 1 — style frames (4K), scores

Rendered with the fixed accumulator (auto samples: 12–36 per frame). The scores are after revision. The
first-pass scores and their causes are in the table above; for the style frames the second pass
changed the following:

- **LIVE:** the mint halo was too wide (technical 7), so the mint was reduced to 2.0.
- **OPTIMIZE:** a stray exit-wire stub remained (technical 7), from a visibility-after-draw bug.
- **MULTIPLY:** 18.5 sits exactly on the ×16 → ×32 step and blended two counter states, so the
  frame moved to 18.45.
- **OPUS:** it sat too low (composition 7), so the baseline moved 906 → 862.
- **BUILD:**
  - The machine top read as a white slab. The metal was a full-depth plate; it is now a thin
    front lip.
  - The blocks then vanished into the dark, so the graphite was lightened.
  - The crane framing cropped the machine; it is now computed from the machine's centre.

| frame | t | comp | type | lyric | motion* | sync | story | orig | tech |
|---|---|---|---|---|---|---|---|---|---|
| LIVE | 12.95 | 8 | 8 | 9 | – | 9 | 8 | 8 | 8 |
| OPTIMIZE | 14.62 | 8 | 9 | 9 | – | 8 | 8 | 8 | 8 |
| MULTIPLY | 18.45 | 9 | 8 | 9 | – | 8 | 8 | 9 | 8 |
| CONTEXT | 19.30 | 8 | 8 | 8 | – | 8 | 8 | 8 | 8 |
| OPUS | 24.45 | 8 | 9 | 9 | – | 9 | 8 | 8 | 8 |
| BUILD | 29.80 | 8 | 8 | 9 | – | 8 | 8 | 8 | 8 |

\* Motion is scored on the motion tests, not on stills. Sync for a still means the state shown is the one the
measured onset calls for at that time.

## Stage 2 — render cost (found when the first 4K motion test ran at 47 s/frame)

At that rate the 5 s chorus test would take ~4 h and the POC ~15 h. The segment was stopped
and each stage was profiled at 4K with `render2 prof`, forcing GPU sync with a readback of
every target:

| stage (t = 24.0, SwiftShader) | ms |
|---|---|
| one temporal sample | 3 140 |
| … with every material overridden by MeshStandard (no env) | 930 |
| … with envMaps removed | 1 180 |
| … without shadow maps | 3 290 (no gain) |
| accumulate one sample | 115 |
| post chain (per frame) | 860 |
| motion probe (per frame) | 80 |

The studio environment (PMREM lookups) was two thirds of every sample, mostly on the two
big graphite planes, which use it at 0.12 intensity. Chrome was already at ~390 % CPU on 4
cores, so running segments in parallel could not help.

| fix | effect |
|---|---|
| Graphite takes the same studio as order-2 spherical harmonics (projected once from RoomEnvironment, `environmentSH`) instead of PMREM lookups. | sample 3.1 → 1.2 s. Image: max 1/255 difference on 7 test frames (mean −0.05 to −0.5 levels). |
| GL backend: ANGLE → desktop GL → Mesa llvmpipe in a private Xvfb, instead of SwiftShader. | A 36-sample 4K frame drops from ~60 s to 9.3 s. Image: mean difference < 0.1 level; 0.2 % of pixels differ > 4 levels, all at sub-pixel edge coverage of thin lines (a different rasterizer); a 4× crop is indistinguishable. Determinism re-verified at 4K (identical SHA-256). |

Net effect: 4K native at the mandated sample counts is affordable, so the motion tests and the
POC render at 3840×2160 and no 1080 fallback is needed.

## Stage 3 — chorus-impact test, first 4K segment (23.20–23.70)

The review was done frame by frame (every 2nd frame tiled at 1/3 scale, suspect frames at 100 %).

| frames | defect | cause | fix |
|---|---|---|---|
| 1392–1414 | The last CONTEXT letter and its rails **strobe**: visible, gone, visible, gone. | The 8th-note steps counted from `tBuild`, but the ease inside each step ran on the absolute half-beat grid. The two are offset, so `closeU` ran backwards on every step and the window re-opened. | Steps and ease share one grid (8ths from the first one at or after `tBuild`); `closeU` is monotonic. |
| 1402 | Two ember strokes. | The final stroke faded in 0.2 s before the rails reached it, and the cursor was lerped twice, landing ahead of the rails and over the O. | The stroke lights only once the last step's ease completes. The cursor rides the right rail, pulling the window shut. |
| 1465 (latent) | The OPUS cut (24.417) falls inside frame 1465's shutter, which would double-expose two shots. | Shutter samples ignored cuts. | Samples and the motion probe are clamped to the frame centre's side of every shot boundary. |
| any | A thin fast mover (a cursor snap) got 12 samples and ghosted. | The probe used mean luma change over the whole frame. | The probe also takes the peak per-pixel change: > 40 → ≥ 36 samples, > 96 → ≥ 72. |

After the fix the sequence reads: the O between rails, with the cursor on the right rail; one snap
into the single stroke on the 8th at 23.40; 0.2 s of stillness; CALL on its onset (23.611).

### Stage 3b — the band stop (23.90), measured

On the first render CALL kept 93 % of its brightness after the key dropped to 12 %, so the stop did not
read. `render2 eval` zeroed each light in turn at 24.05: without the spot the far L stayed at 56/255,
and without any single light it stayed above 55. The remainder came from terms that are not lights:
the porcelain's studio reflection and the wrap lift (a constant 0.18 × albedo). After the stop both now
fade to ~0 with the key (key 4 %), and the ember light rises 3 → 12. The C is lit by the stroke and the
light falls off across A-L-L into the dark: the cursor has become the light.

### Stage 3c — the reasoning space (25.20–26.20)

| defect | fix |
|---|---|
| After the fly-through the knot held completely still, ~0.4 s of dead frame in the chorus. It read as a generic scribble. | Signal pulses run along every path and advance one step per beat (an outExpo step, then stillness), and the knot turns slowly (0.12 rad/s) for parallax. The pulses are denser and paler, not glowing (they stay under the halation threshold; glow stays reserved for the cursor and verification). The taut "reason" path is now sampled in knot space, so it leaves the rotated knot without a pop. |
| The floor's horizon crossed the middle of the knot. | The floor dissolves as the camera enters the O (fly 0.45–0.8), so the reasoning space is a void. The machine later stands on its own workbench. |

### Stage 3d — the verb hand-offs (28.0–28.6)

| defect | fix |
|---|---|
| REASON landed while *difficult* was still at hero size (28.12–28.20, the two words overlapped). | *difficult* is pulled into the code line on "can" (anticipation, inExpo 0.15 s) and lands there just before REASON lands on its onset. The code token appears exactly when the pull ends. |
| WRITE grew in under REASON before REASON had left (28.45 read as a glitch). | Each verb lands on its onset and has left before the next lands (exit inExpo ending 10 ms before the next onset). |
| The name brackets and "a name" framed empty space for a frame after the word left. | They leave with the word. |

## Stage 4 — typography/motion test, 4K (11.80–16.80)

| frames | defect | fix |
|---|---|---|
| 814–818 | The cursor teleported from its rest (path point 3) to the path start at the top-left edge when the pass's anticipation began. The pass was measured from arc length 0. | The pass starts at the rest point's arc length: rest → 60 px pull-back → run, all continuous. |
