import { describe, expect, it } from 'vitest';
import { squareAroundPoint } from '@/lib/domain/acreage';
import { createField, withGeometry } from '@/lib/domain/field';
import type { Field, SourceId, SourceResult } from '@/lib/domain/types';
import { FarmStore, type StoreApi } from '@/lib/client/store';
import { createLocalRepositories, STORAGE_KEYS } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import type { CdlResponse } from '@/lib/sources/cdl';

function fakeApi(opts: { delayMs?: number; failSource?: SourceId } = {}): StoreApi & { sourceCalls: string[]; cdlCalls: number } {
  const api = {
    sourceCalls: [] as string[],
    cdlCalls: 0,
    async fetchSource(source: SourceId, field: Field): Promise<SourceResult> {
      api.sourceCalls.push(`${field.id}:${source}`);
      await new Promise((r) => setTimeout(r, opts.delayMs ?? 1));
      if (source === opts.failSource) return { sourceId: source, sourceName: 'x', docsUrl: '', status: 'unavailable', values: [], message: 'down' };
      return { sourceId: source, sourceName: 'x', docsUrl: '', status: 'ok', fetchedAt: '2026-11-14T00:00:00Z', values: [{ key: 'k', label: 'K', value: field.geometryHash }] };
    },
    async fetchCdl(): Promise<CdlResponse> {
      api.cdlCalls++;
      return { status: 'ok', years: [{ year: 2025, detection: { cdlCode: 5, cdlName: 'Soybeans', sharePct: 90, method: 'sampled', sampleCount: 5, nonCrop: false, fetchedAt: '2026-11-14T00:00:00Z' } }] };
    },
  };
  return api;
}

const NOW = () => new Date('2026-11-14T12:00:00Z');

describe('FarmStore + local repositories', () => {
  it('saves a field, fetches every source and CDL, and survives a reload', async () => {
    const storage = new MemoryStorage();
    const api = fakeApi();
    const store = new FarmStore(createLocalRepositories(storage), api, NOW);
    await store.load();
    const field = createField({ name: 'North 40', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' });
    await store.addFields([field]);
    await store.idle();

    const profile = store.getSnapshot().profiles[field.id];
    expect(Object.values(profile.sources).map((s) => s?.status)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(store.field(field.id)?.crops.history[0]).toMatchObject({ status: 'detected', crop: { id: 'soybeans' } });

    // Layers are stored under separate keys.
    expect(storage.getItem(STORAGE_KEYS.fields)).toContain('North 40');
    expect(storage.getItem(STORAGE_KEYS.profiles)).toContain(field.geometryHash);
    expect(storage.getItem(STORAGE_KEYS.fields)).not.toContain('"sources"');

    // "Reload": a fresh store over the same storage sees everything and fetches nothing new.
    const api2 = fakeApi();
    const reloaded = new FarmStore(createLocalRepositories(storage), api2, NOW);
    await reloaded.load();
    await reloaded.idle();
    expect(reloaded.getSnapshot().fields.map((f) => f.name)).toEqual(['North 40']);
    expect(api2.sourceCalls).toEqual([]);
    expect(api2.cdlCalls).toBe(0);
  });

  it('one failing source does not affect the others', async () => {
    const store = new FarmStore(createLocalRepositories(new MemoryStorage()), fakeApi({ failSource: 'ssurgo' }), NOW);
    await store.load();
    const field = createField({ name: 'A', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' });
    await store.addFields([field]);
    await store.idle();
    const s = store.getSnapshot().profiles[field.id].sources;
    expect(s.ssurgo?.status).toBe('unavailable');
    expect(s.power?.status).toBe('ok');
  });

  it('refetches after a boundary change and discards results for the old shape', async () => {
    const api = fakeApi({ delayMs: 20 });
    const store = new FarmStore(createLocalRepositories(new MemoryStorage()), api, NOW);
    await store.load();
    const field = createField({ name: 'A', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' });
    await store.addFields([field]);
    const moved = withGeometry(field, squareAroundPoint([-93.6, 42], 80));
    await store.updateField(moved); // while the first lookups are still in flight
    await store.idle();
    const profile = store.getSnapshot().profiles[field.id];
    expect(profile.geometryHash).toBe(moved.geometryHash);
    expect(profile.sources.power?.values[0].value).toBe(moved.geometryHash);
  });

  it('refetches stale weather on load but not soil', async () => {
    const storage = new MemoryStorage();
    const store = new FarmStore(createLocalRepositories(storage), fakeApi(), NOW);
    await store.load();
    const field = createField({ name: 'A', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' });
    await store.addFields([field]);
    await store.idle();
    const later = () => new Date('2026-11-20T12:00:00Z');
    const api = fakeApi();
    const next = new FarmStore(createLocalRepositories(storage), api, later);
    await next.load();
    await next.idle();
    expect(api.sourceCalls.map((c) => c.split(':')[1]).sort()).toEqual(['imerg', 'power', 'smap']); // NDVI goes stale after 7 days, soil and elevation never
  });

  it('does nothing external when lookups are turned off, and deletes all layers of a field', async () => {
    const storage = new MemoryStorage();
    const api = fakeApi();
    const store = new FarmStore(createLocalRepositories(storage), api, NOW);
    await store.load();
    await store.setSettings({ externalLookups: false });
    const field = createField({ name: 'Private', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' });
    await store.addFields([field]);
    await store.idle();
    expect(api.sourceCalls).toEqual([]);
    await store.deleteField(field.id);
    expect(store.getSnapshot().fields).toEqual([]);
    expect(storage.getItem(STORAGE_KEYS.fields)).not.toContain('Private');
  });

  it('keeps corrupt storage aside instead of crashing', async () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEYS.fields, '{not json');
    const store = new FarmStore(createLocalRepositories(storage), fakeApi(), NOW);
    await store.load();
    expect(store.getSnapshot().fields).toEqual([]);
    expect(storage.getItem(`${STORAGE_KEYS.fields}.corrupt`)).toBe('{not json');
  });
});

describe('transient failures', () => {
  it('retries lookups that failed because our own server was unreachable', async () => {
    const storage = new MemoryStorage();
    const failing: StoreApi = {
      async fetchSource(source) {
        return { sourceId: source, sourceName: 'x', docsUrl: '', status: 'unavailable', transient: true, values: [], message: 'PlotTwist server could not be reached' };
      },
      async fetchCdl() {
        return { status: 'unavailable', transient: true, years: [], message: 'PlotTwist server could not be reached' };
      },
    };
    const first = new FarmStore(createLocalRepositories(storage), failing, NOW);
    await first.load();
    await first.addFields([createField({ name: 'A', geometry: squareAroundPoint([-93.6, 42], 40), definedBy: 'pin' })]);
    await first.idle();
    const api = fakeApi();
    const second = new FarmStore(createLocalRepositories(storage), api, NOW);
    await second.load();
    await second.idle();
    expect(api.sourceCalls).toHaveLength(6);
    expect(api.cdlCalls).toBe(1);
  });
});
