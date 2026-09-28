// Typography: font loading and word/label textures placed in the 3D scene.
//
// Every lyric word is a textured plane in world space (not an overlay), so
// it takes perspective, depth, bloom and the scene's motion.  Textures are
// rasterised once per (text, font, size) with Canvas2D and cached; per-frame
// animation (colour, opacity, type-on reveal, glow) happens in the shader.
import * as THREE from 'three';

export const FONTS = {
  display: '"Space Grotesk"',
  mono: '"JetBrains Mono"',
  serif: '"Instrument Serif"',
} as const;
export type FontKey = keyof typeof FONTS;

export async function loadFonts(base = './') {
  const faces = [
    new FontFace('Space Grotesk', `url(${base}fonts/SpaceGrotesk.woff2)`, { weight: '300 700' }),
    new FontFace('JetBrains Mono', `url(${base}fonts/JetBrainsMono.woff2)`, { weight: '100 800' }),
    new FontFace('Instrument Serif', `url(${base}fonts/InstrumentSerif.woff2)`, { weight: '400', style: 'normal' }),
    new FontFace('Instrument Serif', `url(${base}fonts/InstrumentSerif-Italic.woff2)`, { weight: '400', style: 'italic' }),
  ];
  await Promise.all(faces.map(async (f) => { await f.load(); document.fonts.add(f); }));
  // make sure every weight we use is actually resolved before the first frame
  await Promise.all([
    document.fonts.load(`300 40px ${FONTS.display}`), document.fonts.load(`700 40px ${FONTS.display}`),
    document.fonts.load(`500 40px ${FONTS.display}`), document.fonts.load(`400 40px ${FONTS.mono}`),
    document.fonts.load(`700 40px ${FONTS.mono}`), document.fonts.load(`italic 400 40px ${FONTS.serif}`),
  ]);
}

export interface Glyphs { tex: THREE.Texture; w: number; h: number; aspect: number; ascent: number }
const cache = new Map<string, Glyphs>();
const measureCtx = document.createElement('canvas').getContext('2d')!;

export interface TextStyle { font?: FontKey; weight?: number; italic?: boolean; px?: number; tracking?: number }

function fontCss(s: Required<TextStyle>) {
  return `${s.italic ? 'italic ' : ''}${s.weight} ${s.px}px ${FONTS[s.font]}`;
}
function fullStyle(s: TextStyle): Required<TextStyle> {
  return { font: s.font ?? 'display', weight: s.weight ?? 600, italic: s.italic ?? false, px: s.px ?? 160, tracking: s.tracking ?? 0 };
}

/** Width of `text` in world units for a given cap-height-ish world size. */
export function measure(text: string, style: TextStyle, worldH: number) {
  const s = fullStyle(style);
  measureCtx.font = fontCss(s);
  const w = measureCtx.measureText(text).width + s.tracking * s.px * Math.max(0, text.length - 1);
  return (w / s.px) * worldH;
}

/** White text on transparent, alpha = coverage; tinted in the shader. */
export function glyphs(text: string, style: TextStyle = {}): Glyphs {
  const s = fullStyle(style);
  const key = `${text}|${fontCss(s)}|${s.tracking}`;
  const hit = cache.get(key);
  if (hit) return hit;
  measureCtx.font = fontCss(s);
  const m = measureCtx.measureText(text);
  const pad = Math.ceil(s.px * 0.25);
  const tw = Math.ceil(m.width + s.tracking * s.px * Math.max(0, text.length - 1));
  const asc = Math.ceil(s.px * 0.95), desc = Math.ceil(s.px * 0.3);
  const cv = document.createElement('canvas');
  cv.width = tw + 2 * pad; cv.height = asc + desc + 2 * pad;
  const c = cv.getContext('2d')!;
  c.font = fontCss(s);
  c.fillStyle = '#fff';
  c.textBaseline = 'alphabetic';
  if (s.tracking) {
    let x = pad;
    for (const ch of text) { c.fillText(ch, x, pad + asc); x += c.measureText(ch).width + s.tracking * s.px; }
  } else c.fillText(text, pad, pad + asc);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  const g = { tex, w: cv.width, h: cv.height, aspect: cv.width / cv.height, ascent: (pad + asc) / cv.height };
  cache.set(key, g);
  return g;
}

const textVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const textFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  uniform float opacity;
  uniform float reveal;   // 0..1 type-on from the left (in texture u)
  uniform float padU;     // texture padding in u (reveal runs over the inked part)
  uniform float glow;     // adds a soft halo (fed to bloom through brightness)
  uniform float lift;     // 0 = normal, >0 brightens toward white
  varying vec2 vUv;
  void main() {
    float a = texture2D(map, vUv).a;
    float u = (vUv.x - padU) / max(1e-4, 1.0 - 2.0 * padU);
    float rv = smoothstep(reveal + 0.002, reveal - 0.02, u);
    vec3 c = mix(color, vec3(1.0), lift);
    // glow = HDR boost only: the bloom pass turns it into a halo (a halo
    // drawn here would be clipped by the plane's rectangle)
    gl_FragColor = vec4(c * (1.0 + glow * 1.6), a * opacity * rv);
  }
`;

/** A word (or label) as a plane in the scene. Anchor: left baseline. */
export class TextMesh extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  readonly g: Glyphs;
  readonly worldH: number;
  readonly widthWorld: number;
  constructor(readonly text: string, style: TextStyle = {}, worldH = 1, align: 'left' | 'center' | 'right' = 'left') {
    const g = glyphs(text, style);
    const s = fullStyle(style);
    // worldH = world height of one em (px); the plane includes padding
    const planeH = worldH * g.h / s.px;
    const planeW = planeH * g.aspect;
    const geo = new THREE.PlaneGeometry(planeW, planeH);
    const padPx = Math.ceil(s.px * 0.25);
    const inkW = planeW * (g.w - 2 * padPx) / g.w;
    // move so the local origin sits on the baseline at the left/centre/right of the ink
    const dx = align === 'left' ? planeW / 2 - planeW * padPx / g.w : align === 'right' ? -planeW / 2 + planeW * padPx / g.w : 0;
    const dy = planeH / 2 - planeH * g.ascent;
    geo.translate(dx, dy, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: g.tex }, color: { value: new THREE.Color(1, 1, 1) }, opacity: { value: 1 },
        reveal: { value: 1 }, padU: { value: padPx / g.w }, glow: { value: 0 }, lift: { value: 0 },
      },
      vertexShader: textVert, fragmentShader: textFrag,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.g = g;
    this.worldH = worldH;
    this.widthWorld = inkW;
  }
  set(color: THREE.ColorRepresentation, opacity: number, reveal = 1, glow = 0, lift = 0) {
    const u = this.material.uniforms;
    u.color.value.set(color);
    u.opacity.value = opacity;
    u.reveal.value = reveal;
    u.glow.value = glow;
    u.lift.value = lift;
    this.visible = opacity > 0.002 && reveal > 0.001;
    return this;
  }
}
