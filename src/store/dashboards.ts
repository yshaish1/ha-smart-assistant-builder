import type { Dashboard, Room, StoredConfig, Tile } from '../types.js';

export const SCHEMA_VERSION = 1;

export function emptyConfig(): StoredConfig {
  const id = uid();
  return {
    schemaVersion: SCHEMA_VERSION,
    activeDashboardId: id,
    dashboards: [
      { id, name: 'Home', order: 0, rooms: [] },
    ],
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function getActive(config: StoredConfig): Dashboard {
  const found = config.dashboards.find(d => d.id === config.activeDashboardId);
  return found ?? config.dashboards[0]!;
}

export function setActive(config: StoredConfig, id: string): StoredConfig {
  return { ...config, activeDashboardId: id };
}

export function addDashboard(config: StoredConfig, name: string): StoredConfig {
  const id = uid();
  const order = (config.dashboards.at(-1)?.order ?? -1) + 1;
  return {
    ...config,
    activeDashboardId: id,
    dashboards: [...config.dashboards, { id, name, order, rooms: [] }],
  };
}

export function renameDashboard(config: StoredConfig, id: string, name: string): StoredConfig {
  return { ...config, dashboards: config.dashboards.map(d => d.id === id ? { ...d, name } : d) };
}

export function deleteDashboard(config: StoredConfig, id: string): StoredConfig {
  if (config.dashboards.length <= 1) return config;
  const next = config.dashboards.filter(d => d.id !== id);
  return { ...config, dashboards: next, activeDashboardId: config.activeDashboardId === id ? next[0]!.id : config.activeDashboardId };
}

export function upsertRoom(dashboard: Dashboard, room: Room): Dashboard {
  const idx = dashboard.rooms.findIndex(r => r.id === room.id);
  if (idx === -1) return { ...dashboard, rooms: [...dashboard.rooms, room] };
  const next = dashboard.rooms.slice();
  next[idx] = room;
  return { ...dashboard, rooms: next };
}

export function deleteRoom(dashboard: Dashboard, roomId: string): Dashboard {
  return { ...dashboard, rooms: dashboard.rooms.filter(r => r.id !== roomId) };
}

export function addTilesToRoom(dashboard: Dashboard, roomId: string, tiles: Tile[]): Dashboard {
  const rooms = dashboard.rooms.map(r => {
    if (r.id !== roomId) return r;
    const existing = new Set(r.tiles.map(t => t.entityId));
    const incoming = tiles.filter(t => !existing.has(t.entityId));
    return { ...r, tiles: [...r.tiles, ...incoming] };
  });
  return { ...dashboard, rooms };
}

export function deleteTile(dashboard: Dashboard, roomId: string, tileId: string): Dashboard {
  const rooms = dashboard.rooms.map(r => r.id === roomId ? { ...r, tiles: r.tiles.filter(t => t.id !== tileId) } : r);
  return { ...dashboard, rooms };
}

export function moveTile(dashboard: Dashboard, roomId: string, fromIdx: number, toIdx: number): Dashboard {
  const rooms = dashboard.rooms.map(r => {
    if (r.id !== roomId) return r;
    const next = r.tiles.slice();
    const [moved] = next.splice(fromIdx, 1);
    if (!moved) return r;
    next.splice(toIdx, 0, moved);
    return { ...r, tiles: next };
  });
  return { ...dashboard, rooms };
}

export function moveRoom(dashboard: Dashboard, fromIdx: number, toIdx: number): Dashboard {
  const next = dashboard.rooms.slice();
  const [moved] = next.splice(fromIdx, 1);
  if (!moved) return dashboard;
  next.splice(toIdx, 0, moved);
  return { ...dashboard, rooms: next };
}

export function replaceDashboard(config: StoredConfig, dashboard: Dashboard): StoredConfig {
  return { ...config, dashboards: config.dashboards.map(d => d.id === dashboard.id ? dashboard : d) };
}
