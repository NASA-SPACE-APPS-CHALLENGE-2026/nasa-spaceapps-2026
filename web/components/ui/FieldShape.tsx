import { bboxOf } from '@/lib/domain/acreage';
import { cropBackground, cropColor } from '@/lib/domain/cropColors';
import type { CropRef, FieldGeometry } from '@/lib/domain/types';

/** SVG path of a field outline, fitted into a square box with a small margin (longitude scaled by latitude). */
export function fieldPath(geometry: FieldGeometry, box = 64, margin = 6): string {
  const [minX, minY, maxX, maxY] = bboxOf(geometry);
  const k = Math.cos(((minY + maxY) / 2) * (Math.PI / 180));
  const w = (maxX - minX) * k || 1e-6;
  const h = maxY - minY || 1e-6;
  const inner = box - margin * 2;
  const s = inner / Math.max(w, h);
  const ox = margin + (inner - w * s) / 2;
  const oy = margin + (inner - h * s) / 2;
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0]);
  return rings.map((ring) => ring.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + (x - minX) * k * s).toFixed(1)},${(oy + (maxY - y) * s).toFixed(1)}`).join('') + 'Z').join('');
}

/**
 * The field as seen from above: its real outline, filled with the colour of the crop growing now.
 * `pinOnly` fields (no boundary drawn) show a dashed square instead of a made-up shape.
 */
export function FieldShape({ geometry, crop, size = 56, pinOnly = false, className = '' }: { geometry: FieldGeometry; crop: CropRef | null; size?: number; pinOnly?: boolean; className?: string }) {
  const fill = crop ? cropColor(crop) : '#d9d2c2';
  const textured = crop && cropBackground(crop) !== cropColor(crop);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`shrink-0 rounded-parcel bg-[#e9e3d4] ${className}`} aria-hidden>
      {/* faint neighbouring parcels, like the patchwork around a field */}
      <path d="M0 21h64M0 43h64M21 0v64M43 0v64" stroke="#d8d0be" strokeWidth="1" />
      {pinOnly ? (
        <rect x="14" y="14" width="36" height="36" fill="none" stroke="#7d6648" strokeWidth="1.5" strokeDasharray="4 3" />
      ) : (
        <>
          <path d={fieldPath(geometry)} fill={fill} stroke="#fbfaf5" strokeWidth="2.5" strokeLinejoin="round" />
          {textured && <path d={fieldPath(geometry)} fill="url(#fs-hatch)" />}
          <path d={fieldPath(geometry)} fill="none" stroke="#241e17" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
        </>
      )}
      <defs>
        <pattern id="fs-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 0v6" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" />
        </pattern>
      </defs>
    </svg>
  );
}
