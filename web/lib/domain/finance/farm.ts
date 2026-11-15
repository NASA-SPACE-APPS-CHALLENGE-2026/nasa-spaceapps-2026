import { acresFromM2 } from '../acreage';
import type { Field, Plan, PlanTask } from '../types';
import type { FarmFieldInput } from './analysis';
import type { FieldSetup } from './budget';
import type { FinanceInputs, SimulatorInputs } from './inputs';
import { currentPlanSeasons, proposedPlanSeasons, thisSeason } from './plans';

/** The Planner plan the farm is following for a field: the most recently changed one. */
export function activePlan(plans: Plan[], fieldId: string): Plan | undefined {
  return plans.filter((p) => p.fieldId === fieldId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

export function fieldAcres(field: Field, finance: FinanceInputs): number {
  // Field geometry remains canonical. Older finance acreage is retained in storage for review.
  void finance;
  return acresFromM2(field.areaM2);
}

export function fieldSetup(field: Field, finance: FinanceInputs, sim?: SimulatorInputs): FieldSetup {
  const f = finance.fields[field.id] ?? {};
  return {
    acres: sim?.acreageOverride && sim.acres && sim.acres > 0 ? sim.acres : fieldAcres(field, finance),
    tenure: f.tenure ?? 'cash',
    rentPerAcre: f.rentPerAcre,
    sharePct: f.sharePct,
    irrigated: f.irrigated ?? false,
    tillage: sim?.tillage,
    nRateCorn: sim?.nRateCorn,
    cropInputs: sim?.cropInputs,
  };
}

export function farmFieldInput(field: Field, plans: Plan[], finance: FinanceInputs, horizon: number = finance.horizon, sim?: SimulatorInputs): FarmFieldInput {
  return {
    id: field.id,
    name: field.name,
    setup: fieldSetup(field, finance, sim),
    thisSeason: thisSeason(field),
    current: currentPlanSeasons(field, horizon),
    proposed: proposedPlanSeasons(field, activePlan(plans, field.id), horizon),
  };
}

export function farmFieldInputs(fields: Field[], plans: Plan[], finance: FinanceInputs): FarmFieldInput[] {
  return fields.map((f) => farmFieldInput(f, plans, finance));
}

/** The field whose weather stands in for the farm: the largest one. */
export function anchorField(fields: Field[]): Field | undefined {
  return [...fields].sort((a, b) => b.areaM2 - a.areaM2)[0];
}

export interface Upcoming {
  fieldId: string;
  fieldName: string;
  year: number;
  task: PlanTask;
}

/** Planner tasks in this month and the next two, across all fields' active plans. */
export function upcomingTasks(fields: Field[], plans: Plan[], now: Date): Upcoming[] {
  const start = now.getFullYear() * 12 + now.getMonth();
  const out: Upcoming[] = [];
  for (const f of fields) {
    const plan = activePlan(plans, f.id);
    for (const s of plan?.seasons ?? []) {
      for (const t of s.tasks) {
        const idx = s.year * 12 + (t.month - 1);
        if (idx >= start && idx <= start + 2) out.push({ fieldId: f.id, fieldName: f.name, year: s.year, task: t });
      }
    }
  }
  return out.sort((a, b) => a.year * 12 + a.task.month - (b.year * 12 + b.task.month));
}
