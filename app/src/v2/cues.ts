// Timing cues for V2 shots: measured hero-word onsets (data/hero_onsets.json)
// with the CTC word times as fallback, looked up by line prefix + word index.
import type { Music, Word } from '../engine/data';

export interface HeroOnset { line: number; word: number; text: string; onset: number }

export class Cues {
  private hero = new Map<string, number>();
  constructor(readonly m: Music, heroes: HeroOnset[]) {
    for (const h of heroes) this.hero.set(`${h.line}:${h.word}`, h.onset);
  }
  line(prefix: string, nth = 0) {
    const all = this.m.l.lines.map((l, i) => [l, i] as const).filter(([l]) => l.text.startsWith(prefix));
    if (!all[nth]) throw new Error(`cue: no line "${prefix}"`);
    return all[nth][1];
  }
  word(prefix: string, wi: number, nth = 0): Word { return this.m.l.lines[this.line(prefix, nth)].words[wi]; }
  /** Onset of a word: measured hero onset if there is one, else the CTC start. */
  on(prefix: string, wi: number, nth = 0) {
    const li = this.line(prefix, nth);
    return this.hero.get(`${li}:${wi}`) ?? this.m.l.lines[li].words[wi].start;
  }
  end(prefix: string, wi: number, nth = 0) { return this.word(prefix, wi, nth).end; }
}

export async function loadCues(m: Music, base = './') {
  const r = await fetch(`${base}data/hero_onsets.json`);
  if (!r.ok) throw new Error('data/hero_onsets.json missing');
  return new Cues(m, (await r.json()).words);
}
