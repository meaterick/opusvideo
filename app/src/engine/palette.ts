// The final palette. Linear-ish values fed to the HDR scene (post applies the
// tone curve), so "hot" accents go above 1 to feed bloom.
import * as THREE from 'three';

export const PAL = {
  ink: new THREE.Color('#07090f'),      // background: blue-black ink
  inkLift: new THREE.Color('#0f1522'),  // panels, far planes
  graphite: new THREE.Color('#2a3140'), // inactive structure, grids
  slate: new THREE.Color('#5d6778'),    // upcoming lyric words, secondary lines
  paper: new THREE.Color('#ece5d8'),    // sung words, documents
  ember: new THREE.Color('#ff7a45'),    // THE CARET / active word / the motif
  emberHot: new THREE.Color('#ffb070'),
  cyan: new THREE.Color('#4fd6e0'),     // tools, data, signals
  pass: new THREE.Color('#7ee0a1'),     // verified / test pass
  fail: new THREE.Color('#ff4d5e'),     // bugs, edge cases, failing tests
} as const;

export const hot = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
