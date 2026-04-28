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
    view['background'] = bg.url;
  } else if (bg.type === 'gradient') {
    // HA section views accept a URL/data-URI string for background. CSS
    // linear-gradient() is not valid in Lovelace storage, so we render the
    // gradient as an inline SVG and pass it as an image URL.
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' preserveAspectRatio='none'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='${bg.from}'/><stop offset='100%' stop-color='${bg.to}'/></linearGradient></defs><rect width='100' height='100' fill='url(%23g)'/></svg>`;
    view['background'] = `data:image/svg+xml;utf8,${encodeURIComponent(svg).replace(/%2523/g, '%23')}`;
  } else if (bg.type === 'solid' && bg.color) {
    view['background'] = bg.color;
  }
}

export function isSabManagedConfig(_cfg: unknown): boolean {
  return false;
}
