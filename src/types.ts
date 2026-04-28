export type DeviceFamily =
  | 'light'
  | 'switch'
  | 'lock'
  | 'cover'
  | 'climate'
  | 'fan'
  | 'vacuum'
  | 'media'
  | 'sensor'
  | 'binary_sensor';

export type PrimaryAction =
  | 'toggle'
  | 'open'
  | 'lock'
  | 'unlock'
  | 'play_pause'
  | 'none';

export type TileSize = 'small' | 'medium' | 'large';

export interface Tile {
  id: string;
  entityId: string;
  family: DeviceFamily;
  attributes: string[];
  primaryAction: PrimaryAction;
  size: TileSize;
}

export interface Room {
  id: string;
  name: string;
  areaId?: string;
  icon?: string;
  tiles: Tile[];
}

export interface Dashboard {
  id: string;
  name: string;
  icon?: string;
  rooms: Room[];
}

export interface ManagedDashboard {
  urlPath: string;
  title: string;
  icon: string;
  dashboard: Dashboard;
  createdAt: number;
  updatedAt: number;
}

export interface ManagedConfig {
  schemaVersion: number;
  dashboards: ManagedDashboard[];
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed?: string;
  last_updated?: string;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  disabled_by: string | null;
  hidden_by: string | null;
  entity_category: 'config' | 'diagnostic' | null;
  platform: string;
  name?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id: string | null;
  manufacturer: string | null;
  model: string | null;
  name: string | null;
  name_by_user: string | null;
  disabled_by: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  icon?: string | null;
}

export interface RealDevice {
  entityId: string;
  family: DeviceFamily;
  friendlyName: string;
  areaId: string | null;
  deviceId: string | null;
  state: string;
  attributes: Record<string, unknown>;
}
