// The edit: scene windows anchored to lyric lines and snapped to the beat
// grid (computed from data/*.json at load time, so re-running the analysis
// re-times the whole video).  Bespoke scenes exist for the proof-of-concept
// stretch (verse 1 second half -> pre-chorus -> chorus 1 first half); every
// other stretch gets a DraftScene naming the capability it will be about.
import type { Music } from './engine/data';
import type { Scene } from './engine/scene';
import { SystemScene } from './scenes/system';
import { ContextScene } from './scenes/context';
import { ArtifactScene } from './scenes/artifact';
import { DraftScene } from './scenes/draft';

/** Proof-of-concept window (seconds), filled in by buildTimeline. */
export const POC = { from: 0, to: 0 };

// Planned capability per stretch (docs/TREATMENT.md): [section, first line prefix, id, capability]
const PLAN: [string, string, string, string][] = [
  ['verse1', 'Drop the repo', 'repo', 'reading and understanding large amounts of context · writing and debugging code'],
  ['chorus1', 'Call in Opus', 'toolbelt', 'using tools'],
  ['verse2', 'Parse the paper', 'lab', 'analyzing documents, data, images and audio · finding edge cases'],
  ['verse2', 'Beat grid', 'pipeline', 'using tools · building complete working systems'],
  ['pre2', 'Not an oracle', 'evidence', 'researching and comparing evidence'],
  ['chorus2', 'Call in Opus', 'artifact-2', 'turning vague ideas into finished artifacts'],
  ['bridge1', 'Read it', 'loop', 'planning complex work · writing and debugging code'],
  ['bridge1', 'Search the evidence', 'views', 'researching and comparing evidence'],
  ['bridge1', 'Text or image', 'senses', 'analyzing documents, data, images and audio'],
  ['final1', 'Call in Opus', 'machine', 'building complete working systems'],
  ['final1', 'Call in Opus', 'world', 'testing and revising its own output'],
  ['outro1', 'Name the goal', 'door', 'turning vague ideas into finished artifacts'],
];

export function buildTimeline(m: Music): Scene[] {
  const L = m.l.lines;
  const idx = (sec: string, prefix: string, nth = 0) => {
    const all = L.map((l, i) => [l, i] as const).filter(([l]) => l.section === sec && l.text.startsWith(prefix));
    if (!all[nth]) throw new Error(`timeline: no line "${prefix}" #${nth} in ${sec}`);
    return all[nth][1];
  };
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

  // ---- bespoke PoC scenes
  const sys = range(idx('verse1', 'Draft the system'), idx('verse1', 'One more pass'));
  const ctx = range(idx('pre1', 'When the hard'), idx('pre1', 'Give it context'));
  const art = range(idx('chorus1', 'Call in Opus'), idx('chorus1', 'Then inspect'));
  const sysStart = L[sys[0]].start - 0.45;
  const ctxStart = L[ctx[0]].start - 0.12;
  const artStart = L[art[0]].start - 0.12;
  const artEnd = L[art[art.length - 1] + 1].start - 0.15;
  const chorus = m.a.sections.find((s) => s.name === 'chorus1')!;
  const landing = chorus.start; // "OPUS" lands on the chorus downbeat
  const bespoke: Scene[] = [
    new SystemScene(m, sys, sysStart, ctxStart),
    new ContextScene(m, ctx, ctxStart, artStart, artStart),
    new ArtifactScene(m, art, artStart, artEnd, landing),
  ];

  // ---- proof-of-concept window: from the beat before "From a sketch" to the
  // downbeat after "It can reason, write, and build it"
  const fromLine = L[idx('verse1', 'From a sketch')];
  const toLine = L[idx('chorus1', 'It can reason')];
  POC.from = m.beatTime(Math.floor(m.beat(fromLine.start)));
  POC.to = m.downbeat(Math.ceil(m.barPos(toLine.end)));

  // ---- drafts for everything else: group uncovered lines by PLAN entries
  const covered = new Set([...sys, ...ctx, ...art]);
  const starts = PLAN.map(([sec, prefix, id, cap], k) => {
    const nth = PLAN.slice(0, k).filter((p) => p[0] === sec && p[1] === prefix).length;
    // chorus1 "Call in Opus" #1 is the second one (the first is the artifact scene)
    const n = sec === 'chorus1' ? 1 : nth;
    return { i: idx(sec, prefix, n), id, cap };
  });
  const drafts: Scene[] = [];
  starts.forEach((s, k) => {
    const next = k + 1 < starts.length ? starts[k + 1].i : L.length;
    const lines = range(s.i, next - 1).filter((i) => !covered.has(i));
    if (!lines.length) return;
    const a = k === 0 ? 0 : L[lines[0]].start - 0.6;
    drafts.push(new DraftScene(m, s.id, s.cap, lines, a, 0));
  });
  // windows: each draft runs until the next scene (draft or bespoke) starts
  const all = [...bespoke, ...drafts].sort((a, b) => a.start - b.start);
  for (let k = 0; k < all.length; k++) {
    const s = all[k];
    if (s instanceof DraftScene) {
      s.end = k + 1 < all.length ? all[k + 1].start : m.a.duration;
      // a draft must not start before the previous scene ends
      if (k > 0) s.start = Math.max(s.start, all[k - 1].end);
    }
  }
  // gaps between a bespoke scene and the next draft -> stretch the draft back
  for (let k = 1; k < all.length; k++) {
    if (all[k] instanceof DraftScene && all[k].start > all[k - 1].end) all[k].start = all[k - 1].end;
  }
  return all;
}
