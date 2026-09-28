// A lyric line as world-space type, typed on by the caret word by word.
//
// Karaoke states (the same everywhere in the video):
//   not yet sung : invisible (the caret types it on at the word's onset)
//   being sung   : ember, glowing, typed on over min(word length, 0.28 s)
//   sung         : paper white, settles
// Scenes usually override per-word transforms (a word flies into the
// diagram, stretches, duplicates...) using `words[i].mesh` and `state(i, t)`.
import * as THREE from 'three';
import { wordState, type Line, type Word } from './data';
import { TextMesh, measure, type TextStyle } from './type';
import { PAL } from './palette';
import { clamp, lerp } from './util';

export interface LineWord { w: Word; mesh: TextMesh; x: number; width: number }

export class LyricLine extends THREE.Group {
  readonly words: LineWord[] = [];
  readonly width: number;
  readonly worldH: number;
  constructor(readonly line: Line, readonly style: TextStyle = {}, worldH = 0.8, align: 'left' | 'center' | 'right' = 'left', upper = false) {
    super();
    this.worldH = worldH;
    const space = measure(' ', style, worldH) * 1.05;
    let x = 0;
    for (const w of line.words) {
      const text = upper ? w.text.toUpperCase() : w.text;
      const mesh = new TextMesh(text, style, worldH, 'left');
      const width = mesh.widthWorld;
      this.words.push({ w, mesh, x, width });
      x += width + space;
    }
    this.width = x - space;
    const shift = align === 'left' ? 0 : align === 'center' ? -this.width / 2 : -this.width;
    for (const lw of this.words) {
      lw.x += shift;
      lw.mesh.position.set(lw.x, 0, 0);
      this.add(lw.mesh);
    }
  }

  static typeDur(w: Word) { return clamp(w.end - w.start, 0.1, 0.28); }

  /** Type-on progress 0..1 of word i at t. */
  reveal(i: number, t: number) {
    const w = this.words[i].w;
    return clamp((t - (w.start - 0.05)) / LyricLine.typeDur(w));
  }

  state(i: number, t: number) { return wordState(this.words[i].w, t); }

  /** Default karaoke look for every word; returns the caret's local x (end of
   *  the text typed so far) and whether the line is currently being typed. */
  update(t: number, opts: { fadeOut?: number; activeColor?: THREE.Color; sungColor?: THREE.Color; opacity?: number } = {}) {
    const act = opts.activeColor ?? PAL.ember;
    const sung = opts.sungColor ?? PAL.paper;
    const op = opts.opacity ?? 1;
    let caretX = this.words.length ? this.words[0].x : 0;
    let typing = false;
    const c = new THREE.Color();
    this.words.forEach((lw, i) => {
      const s = this.state(i, t);
      const rv = this.reveal(i, t);
      // colour: ember while sung, eases to paper over 0.35 s after the word ends
      const settle = clamp((t - Math.max(lw.w.end, lw.w.start + 0.18)) / 0.35);
      c.copy(act).lerp(sung, settle);
      const glow = s.on ? lerp(0.9, 0.0, settle) + s.hit * 0.6 : 0;
      lw.mesh.set(c, op * (opts.fadeOut ?? 1), rv, glow, 0);
      if (rv > 0) caretX = lw.x + lw.width * rv + this.worldH * 0.06;
      if (rv > 0 && rv < 1) typing = true;
    });
    return { caretX, typing };
  }

  /** True once every word has been typed. */
  done(t: number) { return this.words.every((_, i) => this.reveal(i, t) >= 1); }
  started(t: number) { return this.words.length > 0 && t >= this.words[0].w.start - 0.05; }
}
