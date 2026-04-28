import type { StoredConfig } from '../types.js';

export interface ConfigStorage {
  load(): Promise<StoredConfig | null>;
  save(config: StoredConfig): Promise<void>;
}

export const STORAGE_KEY = 'smart_assistant_builder_config_v1';
