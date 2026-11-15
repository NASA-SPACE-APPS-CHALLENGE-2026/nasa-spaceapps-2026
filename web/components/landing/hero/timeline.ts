/**
 * The hero's scroll timeline. Everything is a pure function of scroll progress p (0 = top of the pinned
 * hero, 1 = its end), so scrubbing backward replays exactly what scrubbing forward showed.
 *
 * | p         | text                     | camera / object                                   |
 * |-----------|--------------------------|---------------------------------------------------|
 * | 0.00–0.12 | site name                | high satellite view of the patchwork               |
 * | 0.12–0.30 | tagline                  | descends; the field boundary draws itself          |
 * | 0.30–0.50 | description              | slab lifts out, patchwork fades; oblique field view |
 * | 0.50–0.70 | mission (with pill)      | close on the crop rows                             |
 * | 0.70–1.00 | CTA (stays)              | drops to the slab's side: strata, roots, clods     |
 */

export type Vec3 = [number, number, number];

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
/** 0 before a, 1 after b, smooth in between. */
export const ramp = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---------- Text ----------

export interface TextStep {
  id: 'name' | 'tagline' | 'description' | 'mission' | 'cta';
  /** Fade in between in[0] and in[1]; fade out between out[0] and out[1] (null = stays). */
  in: [number, number] | null;
  out: [number, number] | null;
}

export const TEXT_STEPS: TextStep[] = [
  { id: 'name', in: null, out: [0.1, 0.14] },
  { id: 'tagline', in: [0.13, 0.17], out: [0.27, 0.31] },
  { id: 'description', in: [0.3, 0.34], out: [0.47, 0.51] },
  { id: 'mission', in: [0.5, 0.54], out: [0.67, 0.71] },
  { id: 'cta', in: [0.7, 0.75], out: null },
];

/** Opacity (0–1) and vertical offset (px) of one text step. Steps overlap by about 1% so they cross-fade. */
export function textState(step: TextStep, p: number): { opacity: number; y: number } {
  const inT = step.in ? ramp(p, step.in[0], step.in[1]) : 1;
  const outT = step.out ? ramp(p, step.out[0], step.out[1]) : 0;
  const opacity = Math.min(inT, 1 - outT);
  const y = (1 - inT) * 24 - outT * 24;
  return { opacity, y };
}

/** Which step should own the screen at p (the most visible one). */
export function activeStep(p: number): TextStep['id'] {
  let best = TEXT_STEPS[0];
  let bestO = -1;
  for (const s of TEXT_STEPS) {
    const o = textState(s, p).opacity;
    if (o > bestO) {
      best = s;
      bestO = o;
    }
  }
  return best.id;
}

// ---------- Camera ----------

interface CameraKey {
  p: number;
  pos: Vec3;
  target: Vec3;
}

/** Keyframes. The slab's front face is at z = +3.5, its top at y = lift (0 → 3). */
export const CAMERA_KEYS: CameraKey[] = [
  { p: 0, pos: [0, 150, 34], target: [0, 0, 0] },
  { p: 0.14, pos: [0, 112, 28], target: [0, 0, 0] },
  { p: 0.3, pos: [2, 34, 26], target: [0, 0, 0] },
  { p: 0.5, pos: [16, 13, 19], target: [0, 0.2, 1] },
  { p: 0.7, pos: [5.6, 6.8, 9], target: [0, 1.8, 1.4] },
  { p: 0.88, pos: [3.2, 1.6, 13], target: [0, 0.9, 1.5] },
  { p: 1, pos: [2.2, 1.3, 11.5], target: [0, 0.8, 1.8] },
];

export function cameraAt(p: number): { pos: Vec3; target: Vec3 } {
  const q = clamp01(p);
  for (let i = 0; i < CAMERA_KEYS.length - 1; i++) {
    const a = CAMERA_KEYS[i];
    const b = CAMERA_KEYS[i + 1];
    if (q <= b.p) {
      const t = smooth((q - a.p) / (b.p - a.p));
      return { pos: lerp3(a.pos, b.pos, t), target: lerp3(a.target, b.target, t) };
    }
  }
  const last = CAMERA_KEYS[CAMERA_KEYS.length - 1];
  return { pos: last.pos, target: last.target };
}

// ---------- Scene ----------

export const SLAB_LIFT = 3;

export interface SceneState {
  /** How far the slab has risen out of the patchwork (0 → SLAB_LIFT). */
  lift: number;
  /** Patchwork ground opacity. */
  ground: number;
  /** Share of the boundary outline drawn (0–1). */
  outline: number;
  /** Outline brightness (fades a little once we are down at the soil). */
  outlineGlow: number;
  /** Floating clods (0 hidden → 1 shown). */
  clods: number;
  /** How far the roots have grown down (0–1). */
  roots: number;
  /** Idle drift strength (0 while the slab sits in the patchwork). */
  drift: number;
}

export function sceneAt(p: number): SceneState {
  const lifted = ramp(p, 0.32, 0.48);
  return {
    lift: lifted * SLAB_LIFT,
    ground: 1 - ramp(p, 0.34, 0.5),
    outline: ramp(p, 0.15, 0.29),
    outlineGlow: 1 - 0.55 * ramp(p, 0.78, 0.92),
    clods: ramp(p, 0.42, 0.56),
    roots: ramp(p, 0.72, 0.9),
    drift: lifted,
  };
}

/** Opacity of each optional rendered still (hero-satellite/field/rows/soil) at p. */
export function stillsAt(p: number): Record<'satellite' | 'field' | 'rows' | 'soil', number> {
  return {
    satellite: 1 - ramp(p, 0.26, 0.34),
    field: Math.min(ramp(p, 0.26, 0.34), 1 - ramp(p, 0.52, 0.6)),
    rows: Math.min(ramp(p, 0.52, 0.6), 1 - ramp(p, 0.74, 0.82)),
    soil: ramp(p, 0.74, 0.82),
  };
}

/** Pull the camera back on narrow (portrait) screens so the slab still fits across. */
export function fitFactor(aspect: number): number {
  if (aspect >= 1.2) return 1;
  return Math.min(2.4, 1 + (1.2 - aspect) * 1.6);
}
