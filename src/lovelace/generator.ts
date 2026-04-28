import type { Dashboard, Tile } from '../types.js';
import type { LovelaceConfig } from './api.js';

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
  return {
    type: 'custom:sab-tile-card',
    entity: tile.entityId,
  };
}

export function isSabManagedConfig(_cfg: unknown): boolean {
  return false;
}
