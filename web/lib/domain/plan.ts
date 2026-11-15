import { newId } from './field';
import { MONTH_NAMES, type RotationAnswers } from './management';
import { cropName, HOSTS } from './rotation/agronomy';
import type { Strategy } from './rotation/strategies';
import type { CropRef, Field, Plan, PlanSeason, PlanTask, PlanTaskKind, StrategyId } from './types';

/**
 * Layer 4: editable season-by-season plans. A plan starts from a Rotation Explorer strategy
 * and every edit after that is the farmer's. All functions are pure and return a new plan.
 */

export const TASK_KINDS: Array<{ kind: PlanTaskKind; label: string }> = [
  { kind: 'plant', label: 'Plant' },
  { kind: 'harvest', label: 'Harvest' },
  { kind: 'cover-plant', label: 'Seed cover crop' },
  { kind: 'cover-terminate', label: 'End cover crop' },
  { kind: 'soil-test', label: 'Soil test' },
  { kind: 'scout', label: 'Scout' },
  { kind: 'note', label: 'Note' },
];

export const TASK_KIND_LABEL: Record<PlanTaskKind, string> = Object.fromEntries(TASK_KINDS.map((k) => [k.kind, k.label])) as Record<PlanTaskKind, string>;

export const MAX_PLAN_SEASONS = 6;

const catalog = (id: string): CropRef => ({ kind: 'catalog', id });

function seasonCrop(ids: string[]): CropRef {
  return ids.length === 2 ? { kind: 'double', first: ids[0], second: ids[1] } : catalog(ids[0]);
}

const STRATEGY_PLAN_NAMES: Record<StrategyId, string> = { keep: 'Keep the rotation', cover: 'Cover crop plan', 'small-grains': 'Small grains plan' };

/** Turn a scored strategy into a plan: one row per year, with plant / harvest / cover tasks at the usual months. */
export function planFromStrategy(strategy: Strategy, field: Field, answers: RotationAnswers, opts: { now?: Date; id?: () => string } = {}): Plan {
  const now = (opts.now ?? new Date()).toISOString();
  const id = opts.id ?? newId;
  const tasksByYear = new Map<number, PlanTask[]>();
  const push = (year: number, month: number, kind: PlanTaskKind, label: string) => {
    if (!tasksByYear.has(year)) tasksByYear.set(year, []);
    tasksByYear.get(year)!.push({ id: id(), month, kind, label });
  };

  for (const s of strategy.seasons) {
    for (const c of s.crops) {
      push(c.plantYear, c.plant, 'plant', `Plant ${cropName(c.id).toLowerCase()}`);
      push(c.harvestYear, c.harvest, 'harvest', `Harvest ${cropName(c.id).toLowerCase()}`);
    }
    if (s.cover) {
      const sp = s.cover.pick.species;
      push(s.cover.plantYear, s.cover.plantMonth, 'cover-plant', `Seed ${sp.name.toLowerCase()}`);
      if (!sp.winterKills) push(s.cover.endYear, s.cover.endMonth, 'cover-terminate', `End ${sp.name.toLowerCase()}`);
    }
    const problems = Array.isArray(answers.problems) ? answers.problems : [];
    if (problems.includes('rootworm') && s.ids.some((x) => HOSTS.rootworm.has(x))) push(s.year, 7, 'scout', 'Scout for rootworm beetles');
    if (problems.includes('white-mold') && s.ids.some((x) => HOSTS['white-mold'].has(x))) push(s.year, 7, 'scout', 'Scout for white mold at flowering');
    if (problems.includes('scn') && s.ids.some((x) => HOSTS.scn.has(x))) push(s.year, 11, 'soil-test', 'SCN soil sample after harvest');
  }
  const first = strategy.seasons[0];
  if (first) {
    const lastHarvest = Math.max(...first.crops.map((c) => c.harvest), 9);
    push(first.year, Math.min(12, lastHarvest + 1), 'soil-test', 'Soil test (pH, P, K, organic matter)');
  }

  const planned = new Map(strategy.seasons.map((s) => [s.year, s]));
  const years = [...new Set([...planned.keys(), ...tasksByYear.keys()])].filter((y) => y <= strategy.seasons[strategy.seasons.length - 1].year).sort((a, b) => a - b);
  // Only tasks that fall inside the plan's years are kept (a cover ended after the last year belongs to the next plan).
  const seasons: PlanSeason[] = years.map((year) => {
    const s = planned.get(year);
    const crop = s ? seasonCrop(s.ids) : year === field.crops.current.year ? field.crops.current.crop : null;
    return {
      year,
      crop,
      cover: s?.cover ? { species: s.cover.pick.species.id, name: s.cover.pick.species.name } : undefined,
      tasks: sortTasks(tasksByYear.get(year) ?? []),
    };
  });
  return { id: id(), fieldId: field.id, strategyId: strategy.id, name: `${STRATEGY_PLAN_NAMES[strategy.id]} for ${field.name}`, createdAt: now, updatedAt: now, seasons };
}

const KIND_ORDER: PlanTaskKind[] = ['cover-terminate', 'plant', 'scout', 'harvest', 'cover-plant', 'soil-test', 'note'];
export function sortTasks(tasks: PlanTask[]): PlanTask[] {
  return [...tasks].sort((a, b) => a.month - b.month || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

function touch(plan: Plan, seasons: PlanSeason[], now: Date): Plan {
  return { ...plan, seasons, updatedAt: now.toISOString() };
}

export function renamePlan(plan: Plan, name: string, now = new Date()): Plan {
  const clean = name.trim();
  return clean && clean !== plan.name ? { ...plan, name: clean.slice(0, 80), updatedAt: now.toISOString() } : plan;
}

export function setPlanCrop(plan: Plan, year: number, crop: CropRef | null, now = new Date()): Plan {
  return touch(plan, plan.seasons.map((s) => (s.year === year ? { ...s, crop } : s)), now);
}

export function setPlanCover(plan: Plan, year: number, cover: PlanSeason['cover'] | undefined, now = new Date()): Plan {
  return touch(plan, plan.seasons.map((s) => (s.year === year ? { ...s, cover } : s)), now);
}

export function addTask(plan: Plan, year: number, task: Omit<PlanTask, 'id'> & { id?: string }, now = new Date()): Plan {
  const t: PlanTask = { id: task.id ?? newId(), month: clampMonth(task.month), kind: task.kind, label: task.label.trim() || TASK_KIND_LABEL[task.kind] };
  return touch(plan, plan.seasons.map((s) => (s.year === year ? { ...s, tasks: sortTasks([...s.tasks, t]) } : s)), now);
}

/** Edit a task, including moving it to another month or another year of the plan. */
export function updateTask(plan: Plan, taskId: string, patch: Partial<Omit<PlanTask, 'id'>> & { year?: number }, now = new Date()): Plan {
  const from = plan.seasons.find((s) => s.tasks.some((t) => t.id === taskId));
  if (!from) return plan;
  const old = from.tasks.find((t) => t.id === taskId)!;
  const next: PlanTask = {
    ...old,
    month: patch.month !== undefined ? clampMonth(patch.month) : old.month,
    kind: patch.kind ?? old.kind,
    label: patch.label !== undefined ? patch.label.trim() || TASK_KIND_LABEL[patch.kind ?? old.kind] : old.label,
  };
  const toYear = patch.year !== undefined && plan.seasons.some((s) => s.year === patch.year) ? patch.year : from.year;
  const seasons = plan.seasons.map((s) => {
    let tasks = s.tasks.filter((t) => t.id !== taskId);
    if (s.year === toYear) tasks = sortTasks([...tasks, next]);
    return tasks === s.tasks ? s : { ...s, tasks };
  });
  return touch(plan, seasons, now);
}

/** Drag and drop: move a task to another month and/or another year of the plan. */
export function moveTask(plan: Plan, taskId: string, year: number, month: number, now = new Date()): Plan {
  if (!plan.seasons.some((s) => s.year === year)) return plan;
  return updateTask(plan, taskId, { year, month }, now);
}

export function removeTask(plan: Plan, taskId: string, now = new Date()): Plan {
  return touch(plan, plan.seasons.map((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== taskId) })), now);
}

export function addSeason(plan: Plan, now = new Date()): Plan {
  if (plan.seasons.length >= MAX_PLAN_SEASONS) return plan;
  const last = plan.seasons[plan.seasons.length - 1];
  return touch(plan, [...plan.seasons, { year: (last?.year ?? new Date().getFullYear()) + 1, crop: null, tasks: [] }], now);
}

export function removeLastSeason(plan: Plan, now = new Date()): Plan {
  if (plan.seasons.length <= 1) return plan;
  return touch(plan, plan.seasons.slice(0, -1), now);
}

function clampMonth(m: number): number {
  return Math.min(12, Math.max(1, Math.round(m)));
}

export function taskSummary(t: PlanTask): string {
  return `${MONTH_NAMES[t.month - 1]}: ${t.label}`;
}
