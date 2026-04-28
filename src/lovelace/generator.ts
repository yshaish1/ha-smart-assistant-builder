import type { Dashboard, DeviceFamily, Tile } from '../types.js';
import type { LovelaceConfig } from './api.js';

/**
 * Marker we slip into the title of the only view so reconcileFromHa can spot
 * dashboards Smart created. Goes through HA's lovelace validator unscathed
 * because it's just a string field; gets stripped from the visible title.
 */
export const SAB_TITLE_MARKER = '  · smart';

export function generateLovelaceConfig(dashboard: Dashboard): LovelaceConfig {
  const sections = dashboard.rooms.map(room => ({
    type: 'grid',
    cards: [
      { type: 'heading', heading: room.name },
      ...room.tiles.map(tileCardFor),
    ],
  }));

  return {
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

export function isSabManagedConfig(_cfg: unknown): boolean {
  return false;
}
