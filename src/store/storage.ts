export interface ConfigStorage {
  load(): Promise<unknown | null>;
  save(config: unknown): Promise<void>;
}

export const STORAGE_KEY = 'smart_assistant_builder_managed_v2';
