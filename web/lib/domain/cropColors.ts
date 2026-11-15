import { catalogCrop, cropLabel } from './crops';
import type { CropRef } from './types';

/**
 * One colour per crop, used everywhere (rotation strips, map, planner, charts). Each colour is paired with a
 * short code so colour is never the only signal. Checked for WCAG contrast of the code text and for
 * distinctness under deuteranopia/protanopia on the pairs that sit next to each other in rotations.
 */
const BY_ID: Record<string, { color: string; code: string }> = {
  corn: { color: '#d9a521', code: 'C' },
  'sweet-corn': { color: '#e8c35a', code: 'SC' },
  popcorn: { color: '#e8c35a', code: 'PC' },
  soybeans: { color: '#527a24', code: 'SB' },
  'winter-wheat': { color: '#c9a96a', code: 'WW' },
  'spring-wheat': { color: '#d8be86', code: 'SW' },
  'durum-wheat': { color: '#b8924c', code: 'DW' },
  cotton: { color: '#e4ddcf', code: 'CT' },
  fallow: { color: '#9b8566', code: 'F' },
  'cover-crop': { color: '#1f6f78', code: 'CC' },
  'grass-pasture': { color: '#93ad5c', code: 'PAS' },
  alfalfa: { color: '#476a3a', code: 'ALF' },
};

const BY_GROUP: Record<string, string> = {
  'Row crops': '#c98a3a',
  'Small grains': '#bfa36a',
  'Oilseeds & pulses': '#9aa83a',
  Forage: '#76a356',
  Specialty: '#b86a4a',
  'Rotation states': '#a39c8e',
};

const FALLBACK = '#a39c8e';
/** Swatches dark enough to carry white text; every other swatch carries ink. */
const DARK = new Set(['#527a24', '#476a3a', '#1f6f78']);

export type CropTexture = 'solid' | 'hatch' | 'dots';

function idOf(ref: CropRef | null | undefined): string | null {
  if (!ref) return null;
  if (ref.kind === 'catalog') return ref.id;
  if (ref.kind === 'double') return ref.second;
  return null;
}

export function cropColor(ref: CropRef | null | undefined): string {
  if (!ref) return 'transparent';
  const id = idOf(ref);
  if (!id) return FALLBACK;
  return BY_ID[id]?.color ?? BY_GROUP[catalogCrop(id)?.group ?? ''] ?? FALLBACK;
}

/** Short code shown inside swatches (C, SB, WW…). Falls back to the first letters of the crop name. */
export function cropCode(ref: CropRef | null | undefined): string {
  if (!ref) return '';
  const id = idOf(ref);
  if (ref.kind === 'double' && id) return `${BY_ID[ref.first]?.code ?? '?'}/${BY_ID[id]?.code ?? '?'}`;
  if (id && BY_ID[id]) return BY_ID[id].code;
  const words = cropLabel(ref).replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('') : (words[0] ?? '').slice(0, 3)).toUpperCase().slice(0, 3);
}

/** Text colour that reads on the crop's swatch. */
export function cropInk(ref: CropRef | null | undefined): string {
  return DARK.has(cropColor(ref)) ? '#ffffff' : '#241e17';
}

/** Fallow is hatched and cover crops are dotted, so they read even in greyscale. */
export function cropTexture(ref: CropRef | null | undefined): CropTexture {
  const id = idOf(ref);
  if (id === 'fallow') return 'hatch';
  if (id === 'cover-crop') return 'dots';
  return 'solid';
}

/** CSS background for a swatch, including its texture. */
export function cropBackground(ref: CropRef | null | undefined, color = cropColor(ref)): string {
  const t = cropTexture(ref);
  if (t === 'hatch') return `repeating-linear-gradient(135deg, ${color} 0 5px, #b8a586 5px 8px)`;
  if (t === 'dots') return `radial-gradient(circle at 3px 3px, rgb(255 255 255 / 0.35) 1.2px, transparent 1.6px) 0 0 / 7px 7px, ${color}`;
  return color;
}

/** Cover-crop species drawn on top of a season (Planner, strategy sequences). */
export const COVER_COLOR = BY_ID['cover-crop'].color;
