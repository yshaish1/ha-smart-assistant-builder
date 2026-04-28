import type { HassAdapter } from './adapter.js';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntity,
} from '../types.js';

/**
 * The shape of the `hass` object that Home Assistant injects into custom panels.
 * Only the surface we use is typed here.
 */
export interface HassLike {
  states: Record<string, HassEntity>;
  connection: {
    sendMessagePromise<T>(msg: { type: string; [k: string]: unknown }): Promise<T>;
    subscribeMessage<T>(cb: (msg: T) => void, sub: { type: string; [k: string]: unknown }): Promise<() => void>;
  };
  callService(domain: string, service: string, data?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Real Home Assistant adapter. Bridges our HassAdapter interface to the live
 * `hass` object provided by HA to custom panels. State changes are pushed via
 * the panel re-rendering with a new `hass` prop, which the adapter converts
 * into subscribe() callbacks.
 */
export class RealHassAdapter implements HassAdapter {
  private listeners = new Set<() => void>();
  private entityRegistry: EntityRegistryEntry[] = [];
  private deviceRegistry: DeviceRegistryEntry[] = [];
  private areaRegistry: AreaRegistryEntry[] = [];
  private regUnsub: Array<() => void> = [];

  constructor(private hass: HassLike) {}

  setHass(hass: HassLike): void {
    this.hass = hass;
    this.emit();
  }

  async loadRegistries(): Promise<void> {
    const [entities, devices, areas] = await Promise.all([
      this.hass.connection.sendMessagePromise<EntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
      this.hass.connection.sendMessagePromise<DeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
      this.hass.connection.sendMessagePromise<AreaRegistryEntry[]>({ type: 'config/area_registry/list' }),
    ]);
    this.entityRegistry = entities;
    this.deviceRegistry = devices;
    this.areaRegistry = areas;

    const subs: Array<Promise<() => void>> = [
      this.hass.connection.subscribeMessage(() => this.refreshEntities(), { type: 'config/entity_registry/subscribe_entries' }).catch(() => () => {}),
      this.hass.connection.subscribeMessage(() => this.refreshDevices(), { type: 'config/device_registry/subscribe_entries' }).catch(() => () => {}),
      this.hass.connection.subscribeMessage(() => this.refreshAreas(), { type: 'config/area_registry/subscribe_entries' }).catch(() => () => {}),
    ];
    this.regUnsub = await Promise.all(subs);
    this.emit();
  }

  private async refreshEntities(): Promise<void> {
    this.entityRegistry = await this.hass.connection.sendMessagePromise({ type: 'config/entity_registry/list' });
    this.emit();
  }

  private async refreshDevices(): Promise<void> {
    this.deviceRegistry = await this.hass.connection.sendMessagePromise({ type: 'config/device_registry/list' });
    this.emit();
  }

  private async refreshAreas(): Promise<void> {
    this.areaRegistry = await this.hass.connection.sendMessagePromise({ type: 'config/area_registry/list' });
    this.emit();
  }

  dispose(): void {
    this.regUnsub.forEach(u => u());
    this.regUnsub = [];
    this.listeners.clear();
  }

  getStates(): HassEntity[] {
    return Object.values(this.hass.states);
  }

  getEntityRegistry(): EntityRegistryEntry[] { return this.entityRegistry; }
  getDeviceRegistry(): DeviceRegistryEntry[] { return this.deviceRegistry; }
  getAreaRegistry(): AreaRegistryEntry[] { return this.areaRegistry; }

  async callService(domain: string, service: string, data: Record<string, unknown> = {}): Promise<void> {
    await this.hass.callService(domain, service, data);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    this.listeners.forEach(l => l());
  }
}
