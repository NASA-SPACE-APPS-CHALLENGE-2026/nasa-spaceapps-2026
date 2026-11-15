import type { FarmSettings, Field, FieldProfile, ManagementAnswers } from '../../domain/types';
import type { Repositories } from '../interfaces';
import { FIELDS_MIGRATIONS, FIELDS_VERSION } from './migrations';
import { type KeyValueStorage, VersionedCollection } from './storage';

export const STORAGE_KEYS = {
  fields: 'fieldshift.fields',
  profiles: 'fieldshift.profiles',
  management: 'fieldshift.management',
  settings: 'fieldshift.settings',
} as const;

export const DEFAULT_SETTINGS: FarmSettings = { externalLookups: true };

function byCreated(a: Field, b: Field) {
  return a.createdAt.localeCompare(b.createdAt);
}

/** localStorage-backed repositories. One storage key per layer keeps the layers separate. */
export function createLocalRepositories(storage: KeyValueStorage): Repositories {
  const fields = new VersionedCollection<Field>(storage, STORAGE_KEYS.fields, FIELDS_MIGRATIONS, FIELDS_VERSION);
  const profiles = new VersionedCollection<FieldProfile>(storage, STORAGE_KEYS.profiles);
  const management = new VersionedCollection<ManagementAnswers>(storage, STORAGE_KEYS.management);
  const settings = new VersionedCollection<FarmSettings>(storage, STORAGE_KEYS.settings);

  return {
    fields: {
      async list() {
        return Object.values(fields.read()).sort(byCreated);
      },
      async get(id) {
        return fields.read()[id];
      },
      async save(field) {
        const all = fields.read();
        all[field.id] = field;
        fields.write(all);
      },
      async saveMany(list) {
        const all = fields.read();
        for (const f of list) all[f.id] = f;
        fields.write(all);
      },
      async remove(id) {
        const all = fields.read();
        delete all[id];
        fields.write(all);
      },
    },
    profiles: {
      async get(fieldId) {
        return profiles.read()[fieldId];
      },
      async list() {
        return Object.values(profiles.read());
      },
      async save(profile) {
        const all = profiles.read();
        all[profile.fieldId] = profile;
        profiles.write(all);
      },
      async remove(fieldId) {
        const all = profiles.read();
        delete all[fieldId];
        profiles.write(all);
      },
    },
    management: {
      async get(fieldId) {
        return management.read()[fieldId];
      },
      async save(answers) {
        const all = management.read();
        all[answers.fieldId] = answers;
        management.write(all);
      },
      async remove(fieldId) {
        const all = management.read();
        delete all[fieldId];
        management.write(all);
      },
    },
    settings: {
      async get() {
        return { ...DEFAULT_SETTINGS, ...(settings.read().farm ?? {}) };
      },
      async save(s) {
        settings.write({ farm: s });
      },
    },
  };
}
