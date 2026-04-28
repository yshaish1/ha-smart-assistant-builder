import { STORAGE_KEY, type ConfigStorage } from './storage.js';

export class LocalConfigStorage implements ConfigStorage {
  async load(): Promise<unknown | null> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async save(config: unknown): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}
