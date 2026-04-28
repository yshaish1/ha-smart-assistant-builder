import type { StoredConfig } from '../types.js';
import { STORAGE_KEY, type ConfigStorage } from './storage.js';

export class LocalConfigStorage implements ConfigStorage {
  async load(): Promise<StoredConfig | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as StoredConfig;
    } catch {
      return null;
    }
  }

  async save(config: StoredConfig): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}
