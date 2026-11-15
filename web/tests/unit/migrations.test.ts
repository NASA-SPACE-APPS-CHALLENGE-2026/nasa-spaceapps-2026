import { describe, expect, it } from 'vitest';
import { squareAroundPoint } from '@/lib/domain/acreage';
import { createLocalRepositories, STORAGE_KEYS } from '@/lib/repo/local';
import { fieldsV1toV2 } from '@/lib/repo/local/migrations';
import { MemoryStorage } from '@/lib/repo/local/storage';

const square = squareAroundPoint([-93.6, 42], 40);

function v1Field(id: string, extra: Record<string, unknown>) {
  return {
    id,
    name: id,
    createdAt: '2026-11-14T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
    feature: { type: 'Feature', properties: { name: id }, geometry: square },
    areaM2: 161874,
    geometryHash: 'h',
    crops: { current: { year: 2026, crop: null, origin: 'farmer', status: 'empty' }, history: [] },
    cdl: { status: 'done' },
    ...extra,
  };
}

describe('fields v1 → v2 migration', () => {
  it('marks auto-square pins as approximate and everything else as drawn', () => {
    const out = fieldsV1toV2({
      a: v1Field('a', { definedBy: 'zip-pin', pin: { center: [-93.6, 42], acres: 40 } }),
      b: v1Field('b', { definedBy: 'polygon' }),
      c: v1Field('c', { definedBy: 'import' }),
      d: v1Field('d', { definedBy: 'coordinates', pin: { center: [-93.6, 42], acres: 40 } }),
    }) as Record<string, Record<string, unknown>>;
    expect(out.a).toMatchObject({ boundary: 'approximate', locatedVia: 'zip' });
    expect(out.b).toMatchObject({ boundary: 'drawn' });
    expect(out.c).toMatchObject({ boundary: 'drawn' });
    expect(out.d).toMatchObject({ boundary: 'approximate', locatedVia: 'coordinates' });
    // Geometry and everything else is kept as-is.
    expect((out.a.feature as { geometry: unknown }).geometry).toEqual(square);
  });

  it('is idempotent', () => {
    const once = fieldsV1toV2({ a: v1Field('a', { definedBy: 'pin', pin: { center: [-93.6, 42], acres: 40 } }) });
    expect(fieldsV1toV2(once)).toEqual(once);
  });

  it('runs when reading v1 storage and saves at v2 on the next write', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.fields, JSON.stringify({ schemaVersion: 1, items: { a: v1Field('a', { definedBy: 'pin', pin: { center: [-93.6, 42], acres: 40 } }) } }));
    const repos = createLocalRepositories(storage);
    const [field] = await repos.fields.list();
    expect(field.boundary).toBe('approximate');
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.fields)!).schemaVersion).toBe(1); // reading never writes
    await repos.fields.save({ ...field, name: 'Renamed' });
    const saved = JSON.parse(storage.getItem(STORAGE_KEYS.fields)!);
    expect(saved.schemaVersion).toBe(2);
    expect(saved.items.a).toMatchObject({ name: 'Renamed', boundary: 'approximate' });
  });

  it('leaves other collections at version 1', async () => {
    const storage = new MemoryStorage();
    const repos = createLocalRepositories(storage);
    await repos.settings.save({ externalLookups: false });
    expect(JSON.parse(storage.getItem(STORAGE_KEYS.settings)!).schemaVersion).toBe(1);
  });
});
