import type { FarmSettings, Field, FieldProfile, ManagementAnswers } from '../domain/types';

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

/** Layer 3, filled by the questionnaire in a later milestone. */
export interface ManagementRepository {
  get(fieldId: string): Promise<ManagementAnswers | undefined>;
  save(answers: ManagementAnswers): Promise<void>;
  remove(fieldId: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<FarmSettings>;
  save(settings: FarmSettings): Promise<void>;
}

export interface Repositories {
  fields: FieldRepository;
  profiles: ProfileRepository;
  management: ManagementRepository;
  settings: SettingsRepository;
}
