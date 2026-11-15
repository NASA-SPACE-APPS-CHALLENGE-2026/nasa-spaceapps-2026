/**
 * Storage migrations. migrations[n] upgrades items written at schema version n to n + 1.
 * Each one is pure, idempotent on already-upgraded items, and covered by tests.
 */

type Items = Record<string, unknown>;

/**
 * Fields v1 → v2 (draw-first fields).
 * v1 pins were saved with an auto-generated square boundary. v2 records whether a boundary was drawn by
 * the farmer: those squares become `boundary: 'approximate'` (shown as a pin, "Boundary not drawn"),
 * everything else `boundary: 'drawn'`. The square geometry is kept so existing profiles stay valid.
 */
export function fieldsV1toV2(items: Items): Items {
  const out: Items = {};
  for (const [id, raw] of Object.entries(items)) {
    if (!raw || typeof raw !== 'object') {
      out[id] = raw;
      continue;
    }
    const f = raw as Record<string, unknown>;
    if (f.boundary === 'drawn' || f.boundary === 'approximate') {
      out[id] = f;
      continue;
    }
    const definedBy = f.definedBy as string | undefined;
    const approximate = !!f.pin && definedBy !== 'polygon';
    const locatedVia = definedBy === 'zip-pin' ? 'zip' : definedBy === 'coordinates' ? 'coordinates' : definedBy === 'pin' ? 'pin' : undefined;
    out[id] = { ...f, boundary: approximate ? 'approximate' : 'drawn', ...(locatedVia ? { locatedVia } : {}) };
  }
  return out;
}

export const FIELDS_VERSION = 2;
export const FIELDS_MIGRATIONS = { 1: fieldsV1toV2 };
