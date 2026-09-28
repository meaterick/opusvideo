// V2 edit: the proof-of-concept window, shot by shot (docs/V2_SHOTS.md).
import type { Music } from '../engine/data';
import type { Cues } from './cues';
import type { Shot } from './shot';
import { WallShot } from './shots/wall';
import { DocumentShot } from './shots/document';
import { CallInShot } from './shots/callin';
import { OpusShot } from './shots/opus';

/** From the beat before "From a sketch" to the downbeat after "...and build it". */
export const POC2 = { from: 11.033, to: 29.958 };

export function buildShots(m: Music, cues: Cues): Shot[] {
  return [new WallShot(m, cues), new DocumentShot(m, cues), new CallInShot(m, cues), new OpusShot(m, cues)];
}
