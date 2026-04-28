import type { Dashboard, DashboardSettings, Tile, TileSize } from '../types.js';
import type { LovelaceConfig } from './api.js';

// HA sections view uses a 12-column grid per section. Auto rows so the tile
// can grow to fit its content (sparkline, multiple sliders, etc).
const SIZE_TO_GRID: Record<TileSize, { columns: number }> = {
  small: { columns: 3 },
  medium: { columns: 6 },
  large: { columns: 12 },
};

export function generateLovelaceConfig(dashboard: Dashboard): LovelaceConfig {
  const settings = dashboard.settings;
  const sections = dashboard.rooms.map(room => ({
    type: 'grid',
    cards: [
      { type: 'heading', heading: room.name },
      ...room.tiles.map(t => tileCardFor(t, settings)),
    ],
  }));

  const view: Record<string, unknown> = {
    title: dashboard.name,
    type: 'sections',
    max_columns: settings.maxColumns,
    sections,
  };
  applyBackground(view, settings);

  return {
    title: dashboard.name,
    views: [view],
  };
}

function tileCardFor(tile: Tile, settings: DashboardSettings): Record<string, unknown> {
  const grid = SIZE_TO_GRID[tile.size] ?? SIZE_TO_GRID.medium;
  const card: Record<string, unknown> = {
    type: 'custom:sab-tile-card',
    entity: tile.entityId,
    family: tile.family,
    primaryAction: tile.primaryAction,
    bindings: tile.bindings,
    settings,
    grid_options: { columns: grid.columns, rows: 'auto' },
  };
  if (tile.customName) card['name'] = tile.customName;
  if (tile.customIcon) card['icon'] = tile.customIcon;
  if (tile.colorOverride) card['colorOverride'] = tile.colorOverride;
  return card;
}

function applyBackground(view: Record<string, unknown>, settings: DashboardSettings): void {
  const bg = settings.background;
  if (bg.type === 'image' && bg.url) {
    view['background'] = { image: { url: bg.url, opacity: 100 } };
  } else if (bg.type === 'gradient') {
    view['background'] = { color: `linear-gradient(135deg, ${bg.from}, ${bg.to})` };
  } else if (bg.type === 'solid' && bg.color) {
    view['background'] = { color: bg.color };
  }
}

export function isSabManagedConfig(_cfg: unknown): boolean {
  return false;
}
