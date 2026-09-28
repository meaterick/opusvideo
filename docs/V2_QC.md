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

(filled in below after review)
