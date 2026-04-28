import type { Dashboard, DeviceFamily, Tile } from '../types.js';
import type { LovelaceConfig } from './api.js';

export const SAB_MARKER_KEY = 'sab_managed';

export function generateLovelaceConfig(dashboard: Dashboard): LovelaceConfig {
  const sections = dashboard.rooms.map(room => ({
    type: 'grid',
    cards: [
      { type: 'heading', heading: room.name },
      ...room.tiles.map(tileCardFor),
    ],
  }));

  return {
    [SAB_MARKER_KEY]: { version: 1, dashboardId: dashboard.id },
    title: dashboard.name,
    views: [
      {
        title: dashboard.name,
        type: 'sections',
        max_columns: 4,
        sections,
      },
    ],
  };
}

function tileCardFor(tile: Tile): Record<string, unknown> {
  const card: Record<string, unknown> = {
    type: 'tile',
    entity: tile.entityId,
  };
  const features = featuresFor(tile.family);
  if (features.length > 0) card['features'] = features;
  return card;
}

function featuresFor(family: DeviceFamily): Array<Record<string, unknown>> {
  switch (family) {
    case 'light':
      return [{ type: 'light-brightness' }];
    case 'fan':
      return [{ type: 'fan-speed' }];
    case 'cover':
      return [{ type: 'cover-open-close' }, { type: 'cover-position' }];
    case 'lock':
      return [{ type: 'lock-commands' }];
    case 'climate':
      return [{ type: 'target-temperature' }, { type: 'climate-hvac-modes' }];
    case 'media':
      return [{ type: 'media-player-controls' }, { type: 'media-player-volume-slider' }];
    case 'vacuum':
      return [{ type: 'vacuum-commands' }];
    case 'switch':
    case 'sensor':
    case 'binary_sensor':
      return [];
  }
}

export function isSabManagedConfig(cfg: unknown): boolean {
  return !!cfg && typeof cfg === 'object' && SAB_MARKER_KEY in (cfg as Record<string, unknown>);
}
