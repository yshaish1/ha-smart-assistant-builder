import { LitElement, css, html, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassLike } from '../ha/adapter.real.js';
import type { DeviceFamily, HassEntity } from '../types.js';
import { familyIcon, isOnState } from '../tiles/smart-defaults.js';

interface TileCardConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  attributes?: string[];
}

const DOMAIN_TO_FAMILY: Record<string, DeviceFamily> = {
  light: 'light',
  switch: 'switch',
  lock: 'lock',
  cover: 'cover',
  climate: 'climate',
  fan: 'fan',
  vacuum: 'vacuum',
  media_player: 'media',
  humidifier: 'climate',
  water_heater: 'climate',
  sensor: 'sensor',
  binary_sensor: 'binary_sensor',
};

function fireMoreInfo(node: HTMLElement, entityId: string): void {
  node.dispatchEvent(new CustomEvent('hass-more-info', {
    bubbles: true,
    composed: true,
    detail: { entityId },
  }));
}

@customElement('sab-tile-card')
export class SabTileCard extends LitElement {
  @property({ attribute: false }) hass?: HassLike;
  @state() private config?: TileCardConfig;

  private pressTimer: number | undefined;
  private longPressed = false;

  setConfig(config: TileCardConfig): void {
    if (!config?.entity) throw new Error('Entity is required');
    this.config = config;
  }

  getCardSize(): number { return 1; }

  private get entity(): HassEntity | undefined {
    if (!this.hass || !this.config) return undefined;
    return this.hass.states[this.config.entity];
  }

  private get family(): DeviceFamily {
    const id = this.config?.entity ?? '';
    const domain = id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
    return DOMAIN_TO_FAMILY[domain] ?? 'switch';
  }

  private startPress = (e: PointerEvent): void => {
    this.longPressed = false;
    this.pressTimer = window.setTimeout(() => {
      this.longPressed = true;
      if (this.config) fireMoreInfo(this, this.config.entity);
    }, 380);
    void e;
  };

  private clearPress = (): void => {
    if (this.pressTimer != null) {
      clearTimeout(this.pressTimer);
      this.pressTimer = undefined;
    }
  };

  private endPress = (): void => {
    this.clearPress();
    if (this.longPressed) { this.longPressed = false; return; }
    void this.runPrimary();
  };

  private async runPrimary(): Promise<void> {
    if (!this.hass || !this.config) return;
    const id = this.config.entity;
    const e = this.entity;
    if (!e) return;
    const family = this.family;
    const data = { entity_id: id };
    switch (family) {
      case 'light':
      case 'switch':
      case 'fan':
        await this.hass.callService(family, 'toggle', data); break;
      case 'lock':
        await this.hass.callService('lock', e.state === 'locked' ? 'unlock' : 'lock', data); break;
      case 'cover':
        await this.hass.callService('cover', e.state === 'closed' ? 'open_cover' : 'close_cover', data); break;
      case 'media':
        await this.hass.callService('media_player', 'media_play_pause', data); break;
      case 'vacuum':
      case 'climate':
      case 'sensor':
      case 'binary_sensor':
        if (this.config) fireMoreInfo(this, id);
        break;
    }
  }

  private async onSlider(e: Event): Promise<void> {
    if (!this.hass || !this.config) return;
    const value = parseFloat((e.target as HTMLInputElement).value);
    const id = this.config.entity;
    const family = this.family;
    if (family === 'light') {
      const brightness = Math.round((value / 100) * 255);
      await this.hass.callService('light', 'turn_on', { entity_id: id, brightness });
    } else if (family === 'fan') {
      await this.hass.callService('fan', 'set_percentage', { entity_id: id, percentage: Math.round(value) });
    } else if (family === 'cover') {
      await this.hass.callService('cover', 'set_cover_position', { entity_id: id, position: Math.round(value) });
    } else if (family === 'climate') {
      await this.hass.callService('climate', 'set_temperature', { entity_id: id, temperature: value });
    }
  }

  override render(): TemplateResult {
    if (!this.config) return html``;
    const e = this.entity;
    const id = this.config.entity;
    const name = this.config.name ?? (e?.attributes?.['friendly_name'] as string | undefined) ?? id;
    const family = this.family;
    const state = e?.state ?? 'unavailable';
    const unavailable = state === 'unavailable' || state === 'unknown';
    const on = !unavailable && isOnState(state);

    const showSlider = !unavailable && (
      (family === 'light' && e?.attributes['brightness'] != null) ||
      (family === 'fan' && e?.attributes['percentage'] != null) ||
      (family === 'cover' && e?.attributes['current_position'] != null)
    );
    const sliderValue = e ? sliderValueFor(family, e) : 0;
    const sliderMin = 0;
    const sliderMax = 100;

    return html`
      <div
        class="tile ${on ? 'on' : 'off'} ${unavailable ? 'unavailable' : ''} family-${family}"
        @pointerdown=${this.startPress}
        @pointerup=${this.endPress}
        @pointerleave=${this.clearPress}
        @pointercancel=${this.clearPress}
        title=${id}
      >
        <div class="icon">${familyIcon(family)}</div>
        <div class="name">${name}</div>
        <div class="state">${unavailable ? 'Unavailable' : formatState(family, e)}</div>
        ${showSlider ? html`
          <input
            class="slider"
            type="range"
            min=${sliderMin}
            max=${sliderMax}
            .value=${String(sliderValue)}
            @input=${(e: Event) => void this.onSlider(e)}
            @click=${(e: Event) => e.stopPropagation()}
            @pointerdown=${(e: Event) => e.stopPropagation()}
          />
        ` : ''}
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      --sab-text: var(--primary-text-color, #1a1a1a);
      --sab-muted: var(--secondary-text-color, #6b7280);
      --sab-card: var(--ha-card-background, var(--card-background-color, #fff));
      --sab-divider: var(--divider-color, rgba(0,0,0,0.1));
    }

    .tile {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      padding: 1rem 1.15rem;
      min-height: 116px;
      border-radius: 18px;
      background: var(--sab-card);
      border: 1px solid var(--sab-divider);
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: background 0.18s ease, border-color 0.18s ease, transform 0.06s ease;
      color: var(--sab-text);
      box-sizing: border-box;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .tile:hover { border-color: color-mix(in srgb, var(--primary-color, #6366f1) 40%, var(--sab-divider)); }
    .tile:active { transform: scale(0.985); }

    .tile.on.family-light,
    .tile.on.family-switch {
      background: linear-gradient(140deg, #ffd680, #ffa84d);
      border-color: #ffb060;
      color: #2b1d05;
    }
    .tile.on.family-lock,
    .tile.on.family-cover {
      background: linear-gradient(140deg, #6366f1, #4f46e5);
      border-color: #6366f1;
      color: #fff;
    }
    .tile.on.family-climate,
    .tile.on.family-fan,
    .tile.on.family-media,
    .tile.on.family-vacuum {
      background: linear-gradient(140deg, #34d399, #059669);
      border-color: #10b981;
      color: #fff;
    }
    .tile.on.family-binary_sensor {
      background: linear-gradient(140deg, #f87171, #dc2626);
      border-color: #ef4444;
      color: #fff;
    }

    .tile.unavailable {
      opacity: 0.5;
      filter: grayscale(0.6);
    }

    .icon { font-size: 1.5rem; line-height: 1; margin-bottom: 0.35rem; }
    .name {
      font-size: 0.95rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .state {
      font-size: 0.8rem;
      opacity: 0.85;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .slider {
      margin-top: 0.55rem;
      width: 100%;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(0,0,0,0.18);
      border-radius: 999px;
      outline: none;
      cursor: pointer;
    }
    .tile.on .slider { background: rgba(0,0,0,0.18); }
    .slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 14px; height: 14px;
      border-radius: 50%;
      background: currentColor;
      cursor: pointer;
    }
    .slider::-moz-range-thumb { width: 14px; height: 14px; border-radius: 50%; background: currentColor; border: 0; cursor: pointer; }
  `;
}

function sliderValueFor(family: DeviceFamily, e: HassEntity): number {
  if (family === 'light') {
    const b = e.attributes['brightness'];
    if (typeof b === 'number') return Math.round((b / 255) * 100);
  }
  if (family === 'fan') {
    const p = e.attributes['percentage'];
    if (typeof p === 'number') return Math.round(p);
  }
  if (family === 'cover') {
    const p = e.attributes['current_position'];
    if (typeof p === 'number') return Math.round(p);
  }
  return 0;
}

function formatState(family: DeviceFamily, e: HassEntity | undefined): string {
  if (!e) return '';
  if (family === 'sensor') {
    const unit = e.attributes['unit_of_measurement'] as string | undefined;
    return unit ? `${e.state} ${unit}` : e.state;
  }
  if (family === 'binary_sensor') {
    const cls = e.attributes['device_class'] as string | undefined;
    if (cls === 'motion') return e.state === 'on' ? 'Motion' : 'Clear';
    if (cls === 'window' || cls === 'door') return e.state === 'on' ? 'Open' : 'Closed';
    if (cls === 'moisture') return e.state === 'on' ? 'Wet' : 'Dry';
    return e.state;
  }
  if (family === 'climate') {
    const cur = e.attributes['current_temperature'];
    const target = e.attributes['temperature'];
    if (cur != null && target != null) return `${cur}° → ${target}°`;
    return e.state;
  }
  if (family === 'media') {
    const title = e.attributes['media_title'] as string | undefined;
    if (title && e.state === 'playing') return `▶ ${title}`;
    return e.state;
  }
  if (family === 'cover') {
    const pos = e.attributes['current_position'];
    if (typeof pos === 'number') return `${pos}% open`;
  }
  if (family === 'vacuum') {
    const battery = e.attributes['battery_level'];
    if (typeof battery === 'number') return `${e.state} · ${battery}%`;
  }
  if (family === 'light') {
    const b = e.attributes['brightness'];
    if (e.state === 'on' && typeof b === 'number') return `${Math.round((b / 255) * 100)}%`;
  }
  return e.state;
}

interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
}

declare global {
  interface Window {
    customCards?: CustomCardEntry[];
  }
  interface HTMLElementTagNameMap {
    'sab-tile-card': SabTileCard;
  }
}

window.customCards = window.customCards ?? [];
if (!window.customCards.find(c => c.type === 'sab-tile-card')) {
  window.customCards.push({
    type: 'sab-tile-card',
    name: 'Smart Assistant Tile',
    description: 'Apple Home-style tile from Smart Assistant Builder',
    preview: false,
  });
}
