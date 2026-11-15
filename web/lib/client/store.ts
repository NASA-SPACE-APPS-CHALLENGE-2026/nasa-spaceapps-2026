import { cdlYearsFor, applyDetections } from '../domain/cropHistory';
import { SOURCE_META, SOURCE_ORDER } from '../domain/sourceMeta';
import { toManagementRecord, type RotationAnswers } from '../domain/management';
import type { CdlDetection, FarmSettings, Field, FieldProfile, ManagementAnswers, Plan, SourceId, SourceResult } from '../domain/types';
import type { Repositories } from '../repo/interfaces';
import { DEFAULT_SETTINGS } from '../repo/local';
import type { CdlResponse } from '../sources/cdl';
import { DEFAULT_FINANCE, type FinanceInputs } from '../domain/finance/inputs';
import { classifyYears, type MonthlyWeather, type WeatherHistory } from '../domain/finance/weather';
import { interiorPoint } from '../domain/acreage';

export interface FarmState {
  loaded: boolean;
  fields: Field[];
  profiles: Record<string, FieldProfile>;
  /** Layer 3, keyed by field id. */
  management: Record<string, ManagementAnswers>;
  /** Layer 4, oldest first. */
  plans: Plan[];
  /** Layer 5: Finance tab and Simulator inputs. */
  finance: FinanceInputs;
  /** 40-year NASA POWER weather per field (not persisted; the server caches it). */
  weather: Record<string, WeatherState>;
  settings: FarmSettings;
}

export type WeatherState = { status: 'loading' } | { status: 'ok'; history: WeatherHistory; fetchedAt: string } | { status: 'unavailable'; message: string };

export interface StoreApi {
  fetchSource(source: SourceId, field: Field): Promise<SourceResult>;
  fetchCdl(field: Field, years: number[]): Promise<CdlResponse>;
  fetchWeatherHistory?(field: Field): Promise<{ years: MonthlyWeather[]; fetchedAt: string } | { error: string }>;
}

/** Calls our own Next.js API routes; all third-party requests happen server-side. */
export const httpApi: StoreApi = {
  async fetchSource(source, field) {
    const meta = SOURCE_META[source];
    try {
      const res = await fetch(`/api/profile/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry: field.feature.geometry }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as SourceResult;
    } catch (err) {
      return { sourceId: source, sourceName: meta.provider, docsUrl: meta.docsUrl, status: 'unavailable', transient: true, values: [], message: `PlotTwist server could not be reached (${(err as Error).message}).` };
    }
  },
  async fetchWeatherHistory(field) {
    const [lon, lat] = interiorPoint(field.feature.geometry);
    try {
      const res = await fetch('/api/weather-history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lon, lat }) });
      const body = (await res.json()) as { years?: MonthlyWeather[]; fetchedAt?: string; error?: string };
      if (!res.ok || !body.years) return { error: body.error ?? `HTTP ${res.status}` };
      return { years: body.years, fetchedAt: body.fetchedAt ?? new Date().toISOString() };
    } catch (err) {
      return { error: `PlotTwist server could not be reached (${(err as Error).message}).` };
    }
  },
  async fetchCdl(field, years) {
    try {
      const res = await fetch('/api/cdl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry: field.feature.geometry, years }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as CdlResponse;
    } catch (err) {
      return { status: 'unavailable', transient: true, message: `PlotTwist server could not be reached (${(err as Error).message}). Enter past crops by hand.`, years: [] };
    }
  },
};

const FIELD_CONCURRENCY = 2;

/**
 * Client-side state for the farm: mirrors the repositories, and orchestrates background lookups.
 * Background work is queued (2 fields at a time); each field's sources run in parallel and land independently.
 */
export class FarmStore {
  private state: FarmState = { loaded: false, fields: [], profiles: {}, management: {}, plans: [], finance: DEFAULT_FINANCE, weather: {}, settings: DEFAULT_SETTINGS };
  private listeners = new Set<() => void>();
  private queue: Array<() => Promise<void>> = [];
  private running = 0;
  private inflight = new Set<string>();

  constructor(private repos: Repositories, private api: StoreApi = httpApi, private now: () => Date = () => new Date()) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<FarmState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  field(id: string): Field | undefined {
    return this.state.fields.find((f) => f.id === id);
  }

  async load(): Promise<void> {
    const [fields, profiles, management, plans, finance, settings] = await Promise.all([
      this.repos.fields.list(),
      this.repos.profiles.list(),
      this.repos.management.list(),
      this.repos.plans.list(),
      this.repos.finance.get(),
      this.repos.settings.get(),
    ]);
    this.set({
      loaded: true,
      fields,
      profiles: Object.fromEntries(profiles.map((p) => [p.fieldId, p])),
      management: Object.fromEntries(management.map((m) => [m.fieldId, m])),
      plans,
      finance,
      settings,
    });
    for (const f of fields) this.ensureLookups(f.id);
  }

  // ---------- field CRUD ----------

  async addFields(fields: Field[]): Promise<void> {
    await this.repos.fields.saveMany(fields);
    this.set({ fields: [...this.state.fields, ...fields] });
    for (const f of fields) this.ensureLookups(f.id);
  }

  async updateField(next: Field): Promise<void> {
    const prev = this.field(next.id);
    await this.repos.fields.save(next);
    this.set({ fields: this.state.fields.map((f) => (f.id === next.id ? next : f)) });
    if (prev && prev.geometryHash !== next.geometryHash) this.ensureLookups(next.id);
  }

  async deleteField(id: string): Promise<void> {
    await Promise.all([this.repos.fields.remove(id), this.repos.profiles.remove(id), this.repos.management.remove(id), this.repos.plans.removeForField(id)]);
    const profiles = { ...this.state.profiles };
    delete profiles[id];
    const management = { ...this.state.management };
    delete management[id];
    const settings = this.state.settings.lastFieldId === id ? { ...this.state.settings, lastFieldId: undefined } : this.state.settings;
    if (settings !== this.state.settings) await this.repos.settings.save(settings);
    this.set({ fields: this.state.fields.filter((f) => f.id !== id), profiles, management, plans: this.state.plans.filter((p) => p.fieldId !== id), settings });
  }

  async setSettings(settings: FarmSettings): Promise<void> {
    await this.repos.settings.save(settings);
    this.set({ settings });
    if (settings.externalLookups) for (const f of this.state.fields) this.ensureLookups(f.id);
  }

  /** Remember the field the farmer is working on, so Rotation Explorer and Planner reopen it. */
  async rememberField(id: string): Promise<void> {
    if (this.state.settings.lastFieldId === id || !this.field(id)) return;
    const settings = { ...this.state.settings, lastFieldId: id };
    this.set({ settings });
    await this.repos.settings.save(settings);
  }

  // ---------- Layer 3: questionnaire answers ----------

  async saveAnswers(fieldId: string, answers: RotationAnswers): Promise<void> {
    if (!this.field(fieldId)) return;
    const record = toManagementRecord(fieldId, answers, this.now());
    this.set({ management: { ...this.state.management, [fieldId]: record } });
    await this.repos.management.save(record);
  }

  // ---------- Layer 4: plans ----------

  plan(id: string): Plan | undefined {
    return this.state.plans.find((p) => p.id === id);
  }

  async savePlan(plan: Plan): Promise<void> {
    const exists = this.state.plans.some((p) => p.id === plan.id);
    this.set({ plans: exists ? this.state.plans.map((p) => (p.id === plan.id ? plan : p)) : [...this.state.plans, plan] });
    await this.repos.plans.save(plan);
  }

  async deletePlan(id: string): Promise<void> {
    this.set({ plans: this.state.plans.filter((p) => p.id !== id) });
    await this.repos.plans.remove(id);
  }

  // ---------- Layer 5: finance ----------

  async saveFinance(finance: FinanceInputs): Promise<void> {
    const next = { ...finance, updatedAt: this.now().toISOString() };
    this.set({ finance: next });
    await this.repos.finance.save(next);
  }

  /** Load 40 years of weather for a field once per session (Finance risk view and Simulator scenarios). */
  ensureWeather(fieldId: string): void {
    const field = this.field(fieldId);
    if (!field || !this.state.settings.externalLookups || !this.api.fetchWeatherHistory) return;
    const cur = this.state.weather[fieldId];
    if (cur && cur.status !== 'unavailable') return;
    this.set({ weather: { ...this.state.weather, [fieldId]: { status: 'loading' } } });
    void this.api.fetchWeatherHistory(field).then((res) => {
      const state: WeatherState = 'error' in res ? { status: 'unavailable', message: res.error } : { status: 'ok', history: classifyYears(res.years), fetchedAt: res.fetchedAt };
      this.set({ weather: { ...this.state.weather, [fieldId]: state } });
    });
  }

  // ---------- background lookups ----------

  /** Sources that are missing, interrupted, from an older shape, or stale. */
  sourcesToFetch(field: Field, profile: FieldProfile | undefined): SourceId[] {
    if (!profile || profile.geometryHash !== field.geometryHash) return [...SOURCE_ORDER];
    const now = this.now().getTime();
    return SOURCE_ORDER.filter((id) => {
      const r = profile.sources[id];
      if (!r || r.status === 'loading') return true;
      const stale = SOURCE_META[id].staleAfterMs;
      if (r.status === 'unavailable') return !!r.transient; // provider outages wait for a manual Refresh
      if (stale !== null && r.fetchedAt && now - Date.parse(r.fetchedAt) > stale) return true;
      return false;
    });
  }

  ensureLookups(fieldId: string): void {
    if (!this.state.settings.externalLookups) return;
    const field = this.field(fieldId);
    if (!field) return;
    const sources = this.sourcesToFetch(field, this.state.profiles[fieldId]);
    const needCdl = field.cdl.status === 'idle' || field.cdl.status === 'loading' || (field.cdl.status === 'unavailable' && !!field.cdl.transient);
    if (sources.length || needCdl) this.enqueue(fieldId, sources, needCdl);
  }

  refreshSource(fieldId: string, source: SourceId): void {
    if (!this.state.settings.externalLookups) return;
    this.enqueue(fieldId, [source], false, true);
  }

  retryCdl(fieldId: string): void {
    if (!this.state.settings.externalLookups) return;
    this.enqueue(fieldId, [], true, true);
  }

  private enqueue(fieldId: string, sources: SourceId[], cdl: boolean, priority = false): void {
    const hash = this.field(fieldId)?.geometryHash ?? '';
    const key = `${fieldId}:${hash}:${sources.join(',')}:${cdl}`;
    if (this.inflight.has(key)) return;
    this.inflight.add(key);
    // Mark loading synchronously (before the job can finish) so a fast result is never overwritten by "loading".
    this.markLoading(fieldId, sources, cdl);
    const job = async () => {
      try {
        await this.runLookups(fieldId, sources, cdl);
      } finally {
        this.inflight.delete(key);
      }
    };
    if (priority) this.queue.unshift(job);
    else this.queue.push(job);
    this.pump();
  }

  private pump(): void {
    while (this.running < FIELD_CONCURRENCY && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void job().finally(() => {
        this.running--;
        this.pump();
      });
    }
  }

  /** Resolves when no lookups are queued or running (used by tests). */
  async idle(): Promise<void> {
    while (this.running > 0 || this.queue.length > 0) await new Promise((r) => setTimeout(r, 5));
  }

  private markLoading(fieldId: string, sources: SourceId[], cdl: boolean): void {
    const field = this.field(fieldId);
    if (!field) return;
    if (sources.length) {
      const prev = this.state.profiles[fieldId];
      const base: FieldProfile = prev && prev.geometryHash === field.geometryHash ? prev : { fieldId, geometryHash: field.geometryHash, sources: {} };
      const next: FieldProfile = { ...base, sources: { ...base.sources } };
      for (const id of sources) {
        const meta = SOURCE_META[id];
        next.sources[id] = { ...(base.sources[id] ?? { values: [] }), sourceId: id, sourceName: meta.provider, docsUrl: meta.docsUrl, status: 'loading', values: base.sources[id]?.values ?? [] };
      }
      void this.saveProfile(next);
    }
    if (cdl) void this.patchField(fieldId, (f) => ({ ...f, cdl: { status: 'loading' } }));
  }

  private async runLookups(fieldId: string, sources: SourceId[], cdl: boolean): Promise<void> {
    const field = this.field(fieldId);
    if (!field) return;
    const hash = field.geometryHash;
    const tasks: Promise<void>[] = sources.map(async (id) => {
      const result = await this.api.fetchSource(id, field);
      const current = this.field(fieldId);
      const profile = this.state.profiles[fieldId];
      if (!current || current.geometryHash !== hash || !profile || profile.geometryHash !== hash) return; // shape changed meanwhile
      await this.saveProfile({ ...profile, sources: { ...profile.sources, [id]: result } });
    });
    if (cdl) {
      tasks.push(
        (async () => {
          const years = cdlYearsFor(field.crops);
          const res = await this.api.fetchCdl(field, years);
          const detections: Record<number, CdlDetection | null> = {};
          for (const y of res.years) detections[y.year] = y.detection;
          await this.patchField(fieldId, (f) => {
            if (f.geometryHash !== hash) return f;
            return {
              ...f,
              crops: applyDetections(f.crops, detections),
              cdl: { status: res.status === 'unavailable' ? 'unavailable' : 'done', message: res.message, checkedAt: this.now().toISOString(), transient: res.transient },
            };
          });
        })(),
      );
    }
    await Promise.all(tasks);
  }

  private async saveProfile(profile: FieldProfile): Promise<void> {
    this.set({ profiles: { ...this.state.profiles, [profile.fieldId]: profile } });
    await this.repos.profiles.save(profile);
  }

  private async patchField(fieldId: string, fn: (f: Field) => Field): Promise<void> {
    const f = this.field(fieldId);
    if (!f) return;
    const next = fn(f);
    if (next === f) return;
    this.set({ fields: this.state.fields.map((x) => (x.id === fieldId ? next : x)) });
    await this.repos.fields.save(next);
  }
}
