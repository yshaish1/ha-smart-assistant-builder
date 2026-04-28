import type { ConfigStorage } from './storage.js';
import type { ManagedConfig, ManagedDashboard } from '../types.js';

export const MANAGED_SCHEMA_VERSION = 2;

const empty: ManagedConfig = { schemaVersion: MANAGED_SCHEMA_VERSION, dashboards: [] };

export class ManagedConfigStore {
  private cached: ManagedConfig = empty;

  constructor(private storage: ConfigStorage) {}

  setStorage(storage: ConfigStorage): void { this.storage = storage; }

  async load(): Promise<ManagedConfig> {
    const raw = await this.storage.load();
    if (!raw || typeof raw !== 'object') {
      this.cached = empty;
      return this.cached;
    }
    const r = raw as { dashboards?: unknown };
    if (Array.isArray(r.dashboards) && (r.dashboards.length === 0 || (r.dashboards[0] && typeof r.dashboards[0] === 'object' && 'urlPath' in r.dashboards[0]))) {
      this.cached = raw as ManagedConfig;
    } else {
      this.cached = empty;
    }
    return this.cached;
  }

  async save(config: ManagedConfig): Promise<void> {
    this.cached = config;
    await this.storage.save(config);
  }

  get current(): ManagedConfig { return this.cached; }

  async upsert(d: ManagedDashboard): Promise<ManagedConfig> {
    const idx = this.cached.dashboards.findIndex(m => m.urlPath === d.urlPath);
    const next = idx === -1
      ? { ...this.cached, dashboards: [...this.cached.dashboards, d] }
      : { ...this.cached, dashboards: this.cached.dashboards.map(m => m.urlPath === d.urlPath ? d : m) };
    await this.save(next);
    return next;
  }

  async remove(urlPath: string): Promise<ManagedConfig> {
    const next = { ...this.cached, dashboards: this.cached.dashboards.filter(m => m.urlPath !== urlPath) };
    await this.save(next);
    return next;
  }

  byUrlPath(urlPath: string): ManagedDashboard | undefined {
    return this.cached.dashboards.find(m => m.urlPath === urlPath);
  }
}
