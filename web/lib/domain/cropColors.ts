import { catalogCrop } from './crops';
import type { CropRef } from './types';

/** Swatch colours for the rotation strip, by crop or crop group. Chosen to read on white and stay distinct. */
const BY_ID: Record<string, string> = {
  corn: '#e2b11f',
  'sweet-corn': '#efc94c',
  popcorn: '#efc94c',
  soybeans: '#4f8a3c',
  'winter-wheat': '#c8a05a',
  'spring-wheat': '#d4b274',
  'durum-wheat': '#b98f44',
  cotton: '#cfc6b4',
  fallow: '#b4a58b',
  'cover-crop': '#2f9a86',
  'grass-pasture': '#87b25e',
  alfalfa: '#6a9b4a',
};

const BY_GROUP: Record<string, string> = {
  'Row crops': '#d08a3c',
  'Small grains': '#b99556',
  'Oilseeds & pulses': '#9aa83a',
  Forage: '#76a356',
  Specialty: '#c46b48',
  'Rotation states': '#9aa5a0',
};

export function cropColor(ref: CropRef | null | undefined): string {
  if (!ref) return 'transparent';
  if (ref.kind === 'catalog') return BY_ID[ref.id] ?? BY_GROUP[catalogCrop(ref.id)?.group ?? ''] ?? '#8c9a92';
  if (ref.kind === 'double') return cropColor({ kind: 'catalog', id: ref.second });
  return '#8c9a92';
}
