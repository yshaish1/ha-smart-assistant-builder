import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntity,
} from '../types.js';

export interface HassAdapter {
  getStates(): HassEntity[];
  getEntityRegistry(): EntityRegistryEntry[];
  getDeviceRegistry(): DeviceRegistryEntry[];
  getAreaRegistry(): AreaRegistryEntry[];
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<void>;
  subscribe(listener: () => void): () => void;
}
