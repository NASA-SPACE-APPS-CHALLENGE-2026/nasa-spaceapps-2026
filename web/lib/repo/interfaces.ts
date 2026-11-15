import type { FinanceInputs } from '../domain/finance/inputs';
import type { FarmSettings, Field, FieldProfile, ManagementAnswers, Plan } from '../domain/types';

/**
 * Persistence boundaries. Each layer has its own repository so they can move to a database
 * (or different tables/services) independently. All methods are async so a network-backed
 * implementation can drop in without changing callers.
 */
export interface FieldRepository {
  list(): Promise<Field[]>;
  get(id: string): Promise<Field | undefined>;
  save(field: Field): Promise<void>;
  saveMany(fields: Field[]): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ProfileRepository {
  get(fieldId: string): Promise<FieldProfile | undefined>;
  list(): Promise<FieldProfile[]>;
  save(profile: FieldProfile): Promise<void>;
  remove(fieldId: string): Promise<void>;
}

/** Layer 3: the Rotation Explorer questionnaire (how the farmer manages each field). */
export interface ManagementRepository {
  list(): Promise<ManagementAnswers[]>;
  get(fieldId: string): Promise<ManagementAnswers | undefined>;
  save(answers: ManagementAnswers): Promise<void>;
  remove(fieldId: string): Promise<void>;
}

/** Layer 4: season-by-season plans made in the Planner (several per field are allowed). */
export interface PlanRepository {
  list(): Promise<Plan[]>;
  get(id: string): Promise<Plan | undefined>;
  save(plan: Plan): Promise<void>;
  remove(id: string): Promise<void>;
  removeForField(fieldId: string): Promise<void>;
}

/** Layer 5: the Finance tab's numbers and the Simulator's per-field inputs (one record per farm). */
export interface FinanceRepository {
  get(): Promise<FinanceInputs>;
  save(inputs: FinanceInputs): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<FarmSettings>;
  save(settings: FarmSettings): Promise<void>;
}

export interface Repositories {
  fields: FieldRepository;
  profiles: ProfileRepository;
  management: ManagementRepository;
  plans: PlanRepository;
  finance: FinanceRepository;
  settings: SettingsRepository;
}
