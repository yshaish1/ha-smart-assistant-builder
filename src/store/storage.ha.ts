import { STORAGE_KEY, type ConfigStorage } from './storage.js';

interface HaConnection {
  sendMessagePromise<T>(msg: { type: string; key?: string; value?: unknown }): Promise<T>;
}

export interface HaLikeForStorage {
  connection: HaConnection;
}

/**
 * Persists Smart's "managed dashboards" list via HA's frontend storage WebSocket
 * commands. Each dashboard's actual content lives in HA's normal Lovelace storage,
 * not here - this only tracks the url_paths Smart owns plus the wizard state used
 * to (re)generate them.
 */
export class HaConfigStorage implements ConfigStorage {
  constructor(private readonly hass: HaLikeForStorage) {}

  async load(): Promise<unknown | null> {
    try {
      const result = await this.hass.connection.sendMessagePromise<{ value?: unknown }>({
        type: 'frontend/get_user_data',
        key: STORAGE_KEY,
      });
      return result?.value ?? null;
    } catch {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  }

  async save(config: unknown): Promise<void> {
    try {
      await this.hass.connection.sendMessagePromise({
        type: 'frontend/set_user_data',
        key: STORAGE_KEY,
        value: config,
      });
    } catch {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }
}
