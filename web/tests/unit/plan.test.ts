import { describe, expect, it } from 'vitest';
import { setSeasonCrop } from '@/lib/domain/cropHistory';
import { createField } from '@/lib/domain/field';
import { addSeason, addTask, planFromStrategy, moveTask, removeLastSeason, removeTask, renamePlan, setPlanCrop, updateTask } from '@/lib/domain/plan';
import { buildInputs } from '@/lib/domain/rotation/inputs';
import { buildStrategies } from '@/lib/domain/rotation/strategies';
import type { Field } from '@/lib/domain/types';
import { FarmStore } from '@/lib/client/store';
import { createLocalRepositories, STORAGE_KEYS } from '@/lib/repo/local';
import { MemoryStorage } from '@/lib/repo/local/storage';
import { climateNormals, parseClimatology } from '@/lib/sources/power';
import { AMES_FIELD, fixture } from './helpers';

const NOW = new Date('2026-11-14T12:00:00Z');
const AMES = climateNormals(parseClimatology(JSON.parse(fixture('power-climatology.json'))));

function cornSoy(): Field {
  const f = createField({ name: 'North 40', geometry: AMES_FIELD, definedBy: 'polygon', now: NOW });
  let c = f.crops;
  ['soybeans', 'corn', 'soybeans', 'corn'].forEach((id, i) => (c = setSeasonCrop(c, 2026 - i, { kind: 'catalog', id })));
  return { ...f, crops: c };
}

function strategies(f: Field) {
  const profile = { fieldId: f.id, geometryHash: f.geometryHash, sources: { power: { sourceId: 'power' as const, sourceName: '', docsUrl: '', status: 'ok' as const, values: [], climate: AMES } } };
  return buildStrategies(buildInputs(f, profile, {})).strategies;
}

let n = 0;
const ids = () => `id${++n}`;

describe('plans from strategies', () => {
  it('cover-crop plan: 3 years with plant, harvest, seed-cover and end-cover tasks at the usual months', () => {
    const f = cornSoy();
    const plan = planFromStrategy(strategies(f)[1], f, { problems: ['rootworm'] }, { now: NOW, id: ids });
    expect(plan).toMatchObject({ fieldId: f.id, strategyId: 'cover', name: 'Cover crop plan for North 40' });
    expect(plan.seasons.map((s) => s.year)).toEqual([2027, 2028, 2029]);
    const y27 = plan.seasons[0];
    expect(y27.crop).toEqual({ kind: 'catalog', id: 'corn' });
    expect(y27.cover?.species).toBe('cereal-rye');
    expect(y27.tasks.map((t) => `${t.month}:${t.kind}`)).toEqual(['5:plant', '7:scout', '10:harvest', '10:cover-plant', '11:soil-test']);
    // The rye seeded in fall 2027 is ended in spring 2028, before soybeans.
    expect(plan.seasons[1].tasks.find((t) => t.kind === 'cover-terminate')).toMatchObject({ month: 4, label: 'End cereal rye' });
  });

  it('small-grains plan underseeds red clover with the oats', () => {
    const f = cornSoy();
    const plan = planFromStrategy(strategies(f)[2], f, {}, { now: NOW, id: ids });
    expect(plan.seasons[0].crop).toEqual({ kind: 'catalog', id: 'oats' });
    expect(plan.seasons[0].tasks.filter((t) => t.month === 4).map((t) => t.kind)).toEqual(['plant', 'cover-plant']);
  });

  it('edits are pure and move tasks across months and years', () => {
    const f = cornSoy();
    const plan = planFromStrategy(strategies(f)[0], f, {}, { now: NOW, id: ids });
    const plant = plan.seasons[0].tasks.find((t) => t.kind === 'plant')!;
    const moved = updateTask(plan, plant.id, { month: 6 }, NOW);
    expect(plan.seasons[0].tasks.find((t) => t.id === plant.id)!.month).toBe(5); // original untouched
    expect(moved.seasons[0].tasks.find((t) => t.id === plant.id)!.month).toBe(6);
    const toNextYear = updateTask(moved, plant.id, { year: 2028 }, NOW);
    expect(toNextYear.seasons[0].tasks.some((t) => t.id === plant.id)).toBe(false);
    expect(toNextYear.seasons[1].tasks.some((t) => t.id === plant.id)).toBe(true);
    const added = addTask(toNextYear, 2029, { month: 3, kind: 'note', label: '  ' }, NOW);
    expect(added.seasons[2].tasks[0]).toMatchObject({ month: 3, kind: 'note', label: 'Note' });
    const removed = removeTask(added, added.seasons[2].tasks[0].id, NOW);
    expect(removed.seasons[2].tasks.some((t) => t.kind === 'note')).toBe(false);
    expect(setPlanCrop(removed, 2028, { kind: 'catalog', id: 'oats' }, NOW).seasons[1].crop).toEqual({ kind: 'catalog', id: 'oats' });
    expect(renamePlan(removed, '  My plan ', NOW).name).toBe('My plan');
    expect(addSeason(removed, NOW).seasons.map((s) => s.year)).toEqual([2027, 2028, 2029, 2030]);
    expect(removeLastSeason(removed, NOW).seasons).toHaveLength(2);
    expect(updateTask(plan, 'nope', { month: 1 }, NOW)).toBe(plan);
  });

  it('moves a task by drag and drop to another month and year, ignoring years outside the plan', () => {
    const f = cornSoy();
    const plan = planFromStrategy(strategies(f)[0], f, {}, { now: NOW, id: ids });
    const plant = plan.seasons[0].tasks.find((t) => t.kind === 'plant')!;
    const moved = moveTask(plan, plant.id, plan.seasons[1].year, 7, NOW);
    expect(moved.seasons[0].tasks.some((t) => t.id === plant.id)).toBe(false);
    expect(moved.seasons[1].tasks.find((t) => t.id === plant.id)).toMatchObject({ month: 7, label: plant.label });
    expect(moveTask(plan, plant.id, 1999, 7, NOW)).toBe(plan);
  });
});

describe('store: answers and plans persist in their own layers', () => {
  it('saves answers and plans, reloads them, and deletes them with the field', async () => {
    const storage = new MemoryStorage();
    const api = { fetchSource: async () => ({ sourceId: 'power', sourceName: '', docsUrl: '', status: 'ok', values: [] }) as never, fetchCdl: async () => ({ status: 'ok', years: [] }) as never };
    const store = new FarmStore(createLocalRepositories(storage), api, () => NOW);
    await store.load();
    const f = cornSoy();
    await store.addFields([f]);
    await store.idle();
    await store.saveAnswers(f.id, { tillage: 'no-till' });
    await store.rememberField(f.id);
    const plan = planFromStrategy(strategies(f)[0], f, {}, { now: NOW, id: ids });
    await store.savePlan(plan);
    expect(storage.getItem(STORAGE_KEYS.management)).toContain('no-till');
    expect(storage.getItem(STORAGE_KEYS.plans)).toContain(plan.name);
    expect(storage.getItem(STORAGE_KEYS.fields)).not.toContain('no-till');

    const again = new FarmStore(createLocalRepositories(storage), api, () => NOW);
    await again.load();
    expect(again.getSnapshot().management[f.id].answers).toEqual({ tillage: 'no-till' });
    expect(again.getSnapshot().plans.map((p) => p.id)).toEqual([plan.id]);
    expect(again.getSnapshot().settings.lastFieldId).toBe(f.id);

    await again.deleteField(f.id);
    expect(again.getSnapshot().plans).toEqual([]);
    expect(again.getSnapshot().management[f.id]).toBeUndefined();
    expect(again.getSnapshot().settings.lastFieldId).toBeUndefined();
    expect(storage.getItem(STORAGE_KEYS.plans)).not.toContain(plan.name);
  });
});
