import type { StoredConfig } from '../types.js';
import { STORAGE_KEY, type ConfigStorage } from './storage.js';

interface HaConnection {
  sendMessagePromise<T>(msg: { type: string; key?: string; value?: unknown }): Promise<T>;
}

export interface HaLikeForStorage {
  connection: HaConnection;
}

/**
 * Persists config via HA's frontend storage WebSocket commands. This is the same
 * mechanism Lovelace uses for per-user state and survives restarts. If unavailable
 * on a given HA instance, falls back to localStorage transparently.
 */
export class HaConfigStorage implements ConfigStorage {
  constructor(private readonly hass: HaLikeForStorage) {}

  async load(): Promise<StoredConfig | null> {
    try {
      const result = await this.hass.connection.sendMessagePromise<{ value?: StoredConfig | null }>({
        type: 'frontend/get_user_data',
        key: STORAGE_KEY,
      });
      return result?.value ?? null;
    } catch {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as StoredConfig) : null;
    }
  }

  async save(config: StoredConfig): Promise<void> {
    try {
      await this.hass.connection.sendMessagePromise({
        type: 'frontend/set_user_data',
        key: STORAGE_KEY,
        value: config,
      });
    } catch {
      // best-effort fallback so the user never loses their config
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }
}
