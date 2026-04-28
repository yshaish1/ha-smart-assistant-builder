import { LitElement, css, html, type TemplateResult, svg } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { HassLike } from '../ha/adapter.real.js';
import type { AttributeBinding, DashboardSettings, DeviceFamily, HassEntity, PrimaryAction } from '../types.js';
import { DEFAULT_SETTINGS } from '../types.js';
import { familyEmoji, familyMdi, isOnState } from '../tiles/smart-defaults.js';
import { fetchHistory, type HistoryPoint } from '../ha/history.js';

interface TileCardConfig {
  type: string;
  entity: string;
  family?: DeviceFamily;
  primaryAction?: PrimaryAction;
  bindings?: AttributeBinding[];
  settings?: DashboardSettings;
  name?: string;
  icon?: string;
  colorOverride?: string;
}

const DOMAIN_TO_FAMILY: Record<string, DeviceFamily> = {
  light: 'light', switch: 'switch', lock: 'lock', cover: 'cover', climate: 'climate',
  fan: 'fan', vacuum: 'vacuum', media_player: 'media',
  humidifier: 'climate', water_heater: 'climate',
  sensor: 'sensor', binary_sensor: 'binary_sensor',
};

function fireMoreInfo(node: HTMLElement, entityId: string): void {
  node.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId } }));
}

@customElement('sab-tile-card')
export class SabTileCard extends LitElement {
  @property({ attribute: false }) hass?: HassLike;
  @property({ attribute: false }) config?: TileCardConfig;
  @state() private history: HistoryPoint[] = [];

  private pressTimer: number | undefined;
  private longPressed = false;
  private historyKey = '';

  setConfig(config: TileCardConfig): void {
    if (!config?.entity) throw new Error('Entity is required');
    this.config = config;
  }

  getCardSize(): number {
    const sz = this.config?.bindings?.some(b => b.render === 'sparkline') ? 2 : 1;
    return sz;
  }

  override updated(): void {
    if (!this.hass || !this.config) return;
    const wantSpark = this.config.bindings?.some(b => b.render === 'sparkline') ?? false;
    if (!wantSpark) return;
    const key = this.config.entity;
    if (key === this.historyKey) return;
    this.historyKey = key;
    void fetchHistory(this.hass, key, 24).then(pts => { this.history = pts; });
  }

  private get entity(): HassEntity | undefined {
    if (!this.hass || !this.config) return undefined;
    return this.hass.states[this.config.entity];
  }

  private get family(): DeviceFamily {
    if (this.config?.family) return this.config.family;
    const id = this.config?.entity ?? '';
    const domain = id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
    return DOMAIN_TO_FAMILY[domain] ?? 'switch';
  }

  private get settings(): DashboardSettings {
    return this.config?.settings ?? DEFAULT_SETTINGS;
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
    if (this.pressTimer != null) { clearTimeout(this.pressTimer); this.pressTimer = undefined; }
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
    const action = this.config.primaryAction ?? 'auto';
    if (action === 'none') return;
    if (action === 'more_info') { fireMoreInfo(this, id); return; }
    if (action === 'auto' || action === 'toggle') {
      switch (family) {
        case 'light':
        case 'switch':
        case 'fan':
          await this.hass.callService(family, 'toggle', data); return;
        case 'lock':
          await this.hass.callService('lock', e.state === 'locked' ? 'unlock' : 'lock', data); return;
        case 'cover':
          await this.hass.callService('cover', e.state === 'closed' ? 'open_cover' : 'close_cover', data); return;
        case 'media':
          await this.hass.callService('media_player', 'media_play_pause', data); return;
        default:
          fireMoreInfo(this, id); return;
      }
    }
    if (action === 'lock' || action === 'unlock') {
      await this.hass.callService('lock', e.state === 'locked' ? 'unlock' : 'lock', data); return;
    }
    if (action === 'open') { await this.hass.callService('cover', e.state === 'closed' ? 'open_cover' : 'close_cover', data); return; }
    if (action === 'play_pause') { await this.hass.callService('media_player', 'media_play_pause', data); return; }
  }

  private async mediaControl(service: string): Promise<void> {
    if (!this.hass || !this.config) return;
    await this.hass.callService('media_player', service, { entity_id: this.config.entity });
  }

  private async mediaMute(): Promise<void> {
    if (!this.hass || !this.config) return;
    const e = this.entity;
    if (!e) return;
    const cur = !!e.attributes['is_volume_muted'];
    await this.hass.callService('media_player', 'volume_mute', { entity_id: this.config.entity, is_volume_muted: !cur });
  }

  private async onSlider(binding: AttributeBinding, e: Event): Promise<void> {
    if (!this.hass || !this.config) return;
    const value = parseFloat((e.target as HTMLInputElement).value);
    const id = this.config.entity;
    const family = this.family;
    if (binding.attribute === 'brightness') {
      const brightness = Math.round((value / 100) * 255);
      await this.hass.callService('light', 'turn_on', { entity_id: id, brightness });
    } else if (binding.attribute === 'percentage') {
      await this.hass.callService('fan', 'set_percentage', { entity_id: id, percentage: Math.round(value) });
    } else if (binding.attribute === 'current_position') {
      await this.hass.callService('cover', 'set_cover_position', { entity_id: id, position: Math.round(value) });
    } else if (binding.attribute === 'temperature') {
      await this.hass.callService('climate', 'set_temperature', { entity_id: id, temperature: value });
    } else if (binding.attribute === 'volume_level') {
      await this.hass.callService('media_player', 'volume_set', { entity_id: id, volume_level: value / 100 });
    } else if (typeof family === 'string') {
      // generic numeric attribute - no service mapping, just ignore
    }
  }

  override render(): TemplateResult {
    if (!this.config) return html``;
    const e = this.entity;
    const id = this.config.entity;
    const settings = this.settings;
    const name = this.config.name ?? (e?.attributes?.['friendly_name'] as string | undefined) ?? id;
    const family = this.family;
    const state = e?.state ?? 'unavailable';
    const unavailable = state === 'unavailable' || state === 'unknown';
    const on = !unavailable && isOnState(state);
    const bindings = this.config.bindings ?? [];

    const isNumericAttr = (attr: string): boolean => {
      if (attr === 'state' && e) return Number.isFinite(parseFloat(e.state));
      const v = e?.attributes[attr];
      return typeof v === 'number';
    };
    const isPrimitiveAttr = (attr: string): boolean => {
      if (attr === 'state') return true;
      const v = e?.attributes[attr];
      return v != null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean');
    };
    const text = bindings.filter(b => b.render === 'text' && isPrimitiveAttr(b.attribute));
    const sliders = bindings.filter(b => b.render === 'slider' && isNumericAttr(b.attribute));
    const badges = bindings.filter(b => b.render === 'badge' && isPrimitiveAttr(b.attribute));
    const sparkline = bindings.find(b => b.render === 'sparkline' && isNumericAttr(b.attribute));
    const toggles = bindings.filter(b => b.render === 'toggle' && isPrimitiveAttr(b.attribute));
    const images = bindings.filter(b => b.render === 'image' && typeof e?.attributes[b.attribute] === 'string' && (e!.attributes[b.attribute] as string).length > 0);
    const heroImage = images.length > 0 ? (e!.attributes[images[0]!.attribute] as string) : undefined;

    const accent = this.config.colorOverride ?? settings.accentColor;
    const density = settings.density;

    const styleVars = `--sab-accent: ${accent};`;

    return html`
      <div
        class="tile ${on ? 'on' : 'off'} ${unavailable ? 'unavailable' : ''} family-${family} density-${density}"
        style=${styleVars}
        @pointerdown=${this.startPress}
        @pointerup=${this.endPress}
        @pointerleave=${this.clearPress}
        @pointercancel=${this.clearPress}
        title=${id}
      >
        ${badges.length > 0 ? html`
          <div class="badges">
            ${badges.map(b => this.renderBadge(b))}
          </div>
        ` : ''}

        ${this.renderIcon(family, heroImage)}
        <div class="name">${name}</div>
        <div class="state">${unavailable || !e ? (unavailable ? 'Unavailable' : '') : defaultStateLine(family, e)}</div>

        ${text.map(b => html`
          <div class="text-row">
            <span class="text-key">${b.label ?? prettyAttr(b.attribute)}</span>
            <span class="text-val">${formatAttr(e, b.attribute)}</span>
          </div>
        `)}

        ${sliders.map(b => {
          const value = sliderValueForBinding(b, e);
          return html`
            <div class="slider-row">
              <span class="slider-label">${b.label ?? prettyAttr(b.attribute)}</span>
              <input
                class="slider"
                type="range"
                min=${sliderMin(b)}
                max=${sliderMax(b)}
                step=${sliderStep(b)}
                .value=${String(value)}
                @input=${(ev: Event) => void this.onSlider(b, ev)}
                @click=${(ev: Event) => ev.stopPropagation()}
                @pointerdown=${(ev: Event) => ev.stopPropagation()}
                @pointerup=${(ev: Event) => ev.stopPropagation()}
                @pointercancel=${(ev: Event) => ev.stopPropagation()}
              />
            </div>
          `;
        })}

        ${sparkline ? html`
          <div class="spark">
            ${this.renderSparkline()}
          </div>
        ` : ''}

        ${toggles.map(b => this.renderToggle(b, on, e))}
        ${family === 'media' && !unavailable ? this.renderMediaControls(e) : ''}
      </div>
    `;
  }

  private renderMediaControls(e?: HassEntity): TemplateResult {
    if (!e) return html``;
    const supported = (e.attributes['supported_features'] as number | undefined) ?? 0;
    const can = (bit: number): boolean => supported === 0 || (supported & bit) !== 0;
    // Bitmask values from media_player.const
    const PREV = 16, NEXT = 32, MUTE = 8;
    const stop = (ev: Event) => ev.stopPropagation();
    const muted = !!e.attributes['is_volume_muted'];
    return html`
      <div class="media-controls" @pointerdown=${stop} @pointerup=${stop} @click=${stop}>
        ${can(PREV) ? html`<button class="mc" @pointerup=${(ev: Event) => { ev.stopPropagation(); void this.mediaControl('media_previous_track'); }} title="Previous">⏮</button>` : ''}
        <button class="mc primary-mc" @pointerup=${(ev: Event) => { ev.stopPropagation(); void this.mediaControl('media_play_pause'); }} title="Play/Pause">${e.state === 'playing' ? '⏸' : '▶'}</button>
        ${can(NEXT) ? html`<button class="mc" @pointerup=${(ev: Event) => { ev.stopPropagation(); void this.mediaControl('media_next_track'); }} title="Next">⏭</button>` : ''}
        ${can(MUTE) ? html`<button class="mc ${muted ? 'active' : ''}" @pointerup=${(ev: Event) => { ev.stopPropagation(); void this.mediaMute(); }} title="Mute">${muted ? '🔇' : '🔊'}</button>` : ''}
      </div>
    `;
  }

  private renderToggle(b: AttributeBinding, _entityOn: boolean, e?: HassEntity): TemplateResult {
    if (!e) return html``;
    const isStateAttr = b.attribute === 'state';
    const value = isStateAttr ? toBool(e.state) : toBool(e.attributes[b.attribute]);
    const label = b.label ?? prettyAttr(b.attribute);
    const interactive = this.toggleHandlerFor(b.attribute) != null;
    const stop = (ev: Event) => ev.stopPropagation();
    return html`
      <div
        class="toggle-row ${interactive ? 'interactive' : ''}"
        @pointerdown=${stop}
        @pointermove=${stop}
        @pointercancel=${stop}
        @click=${stop}
        @pointerup=${(ev: PointerEvent) => {
          ev.stopPropagation();
          if (interactive) void this.runToggleAction(b.attribute);
        }}
      >
        <span class="toggle-label">${label}</span>
        <span class="toggle ${value ? 'on' : 'off'} ${interactive ? '' : 'readonly'}" role="switch" aria-checked=${value ? 'true' : 'false'}>
          <span class="knob"></span>
        </span>
      </div>
    `;
  }

  private toggleHandlerFor(attribute: string): (() => Promise<void>) | null {
    if (!this.hass || !this.config) return null;
    const e = this.entity;
    if (!e) return null;
    const id = this.config.entity;
    const family = this.family;
    if (attribute === 'state') {
      if (family === 'light' || family === 'switch' || family === 'fan') return async () => { await this.hass!.callService(family, 'toggle', { entity_id: id }); };
      if (family === 'lock') return async () => { await this.hass!.callService('lock', e.state === 'locked' ? 'unlock' : 'lock', { entity_id: id }); };
      if (family === 'cover') return async () => { await this.hass!.callService('cover', e.state === 'closed' ? 'open_cover' : 'close_cover', { entity_id: id }); };
      if (family === 'media') return async () => { await this.hass!.callService('media_player', 'media_play_pause', { entity_id: id }); };
      return null;
    }
    if (attribute === 'is_volume_muted' && family === 'media') {
      return async () => { await this.hass!.callService('media_player', 'volume_mute', { entity_id: id, is_volume_muted: !toBool(e.attributes[attribute]) }); };
    }
    return null;
  }

  private async runToggleAction(attribute: string): Promise<void> {
    const handler = this.toggleHandlerFor(attribute);
    if (handler) await handler();
  }


  private renderIcon(family: DeviceFamily, heroImage?: string): TemplateResult {
    if (heroImage) {
      return html`<div class="icon img"><img src=${heroImage} alt="" loading="lazy" /></div>`;
    }
    const style = this.settings.iconStyle;
    if (style === 'off') return html``;
    const customIcon = this.config?.icon;
    if (style === 'mdi') {
      const icon = customIcon ?? familyMdi(family);
      return html`<div class="icon mdi"><ha-icon icon=${icon}></ha-icon></div>`;
    }
    return html`<div class="icon emoji">${customIcon ?? familyEmoji(family)}</div>`;
  }

  private renderBadge(b: AttributeBinding): TemplateResult {
    const e = this.entity;
    const v = formatAttr(e, b.attribute);
    return html`<span class="badge" title=${b.attribute}>${b.label ? `${b.label}: ${v}` : v}</span>`;
  }

  private renderSparkline(): TemplateResult {
    const pts = this.history;
    if (!pts.length) return html`<div class="spark-empty"></div>`;
    const w = 220, h = 36, pad = 2;
    const values = pts.map(p => p.v);
    const min = Math.min(...values), max = Math.max(...values), range = max - min || 1;
    const stepX = (w - pad * 2) / (pts.length - 1 || 1);
    let pathD = '';
    pts.forEach((p, i) => {
      const x = pad + i * stepX;
      const y = h - pad - ((p.v - min) / range) * (h - pad * 2);
      pathD += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)} `;
    });
    return html`
      <svg viewBox="0 0 ${w} ${h}" width="100%" height=${h} preserveAspectRatio="none" style="display:block;">
        ${svg`<path d=${pathD + `L${w - pad},${h} L${pad},${h} Z`} fill="currentColor" fill-opacity="0.15" />`}
        ${svg`<path d=${pathD} fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />`}
      </svg>
    `;
  }

  static override styles = css`
    :host {
      display: block;
      --sab-text: var(--primary-text-color, #1a1a1a);
      --sab-muted: var(--secondary-text-color, #6b7280);
      --sab-card: var(--ha-card-background, var(--card-background-color, #fff));
      --sab-divider: var(--divider-color, rgba(0,0,0,0.1));
      --sab-accent: var(--primary-color, #6366f1);
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
      overflow: hidden;
    }
    .tile:hover { border-color: color-mix(in srgb, var(--sab-accent) 40%, var(--sab-divider)); }
    .tile:active { transform: scale(0.985); }

    .density-compact { padding: 0.7rem 0.85rem; min-height: 92px; gap: 0.15rem; }
    .density-spacious { padding: 1.35rem 1.55rem; min-height: 142px; gap: 0.3rem; }

    .tile.on.family-light,
    .tile.on.family-switch {
      background: linear-gradient(140deg, color-mix(in srgb, var(--sab-accent) 60%, #ffd680), var(--sab-accent));
      border-color: var(--sab-accent);
      color: white;
    }
    .tile.on.family-lock,
    .tile.on.family-cover {
      background: linear-gradient(140deg, var(--sab-accent), color-mix(in srgb, var(--sab-accent) 70%, black));
      border-color: var(--sab-accent);
      color: #fff;
    }
    .tile.on.family-climate,
    .tile.on.family-fan,
    .tile.on.family-media,
    .tile.on.family-vacuum {
      background: linear-gradient(140deg, color-mix(in srgb, var(--sab-accent) 70%, #34d399), var(--sab-accent));
      border-color: var(--sab-accent);
      color: #fff;
    }
    .tile.on.family-binary_sensor {
      background: linear-gradient(140deg, #f87171, #dc2626);
      border-color: #ef4444;
      color: #fff;
    }

    .tile.unavailable { opacity: 0.5; filter: grayscale(0.6); }

    .icon { line-height: 1; margin-bottom: 0.35rem; }
    .icon.emoji { font-size: 1.5rem; }
    .icon.mdi { font-size: 0; }
    .icon.mdi ha-icon { --mdc-icon-size: 28px; color: currentColor; }
    .icon.img { width: 36px; height: 36px; }
    .icon.img img {
      width: 100%; height: 100%;
      border-radius: 50%;
      object-fit: cover;
      display: block;
    }

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

    .text-row {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
      font-size: 0.75rem;
      opacity: 0.85;
      margin-top: 0.15rem;
    }
    .text-key { color: var(--sab-muted); }
    .tile.on .text-key { color: rgba(255,255,255,0.75); }

    .badges {
      position: absolute;
      top: 0.55rem;
      inset-inline-end: 0.6rem;
      display: flex;
      gap: 0.3rem;
      flex-wrap: wrap;
    }
    .badge {
      font-size: 0.65rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: rgba(0,0,0,0.08);
      color: var(--sab-muted);
      letter-spacing: 0.02em;
    }
    .tile.on .badge { background: rgba(0,0,0,0.18); color: rgba(255,255,255,0.9); }

    .slider-row { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.55rem; }
    .slider-label { font-size: 0.7rem; opacity: 0.7; }
    .slider {
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

    .spark { margin-top: 0.55rem; color: var(--sab-accent); }
    .tile.on .spark { color: white; }
    .spark-empty { height: 36px; }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-top: 0.55rem;
      cursor: default;
    }
    .toggle-row.interactive { cursor: pointer; }
    .toggle-label { font-size: 0.8rem; opacity: 0.85; pointer-events: none; }
    .toggle {
      display: inline-block;
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background: rgba(0,0,0,0.18);
      position: relative;
      transition: background 0.15s ease;
      flex-shrink: 0;
    }
    .toggle.readonly { cursor: default; opacity: 0.7; }
    .toggle:not(.readonly) { cursor: pointer; }
    .toggle .knob {
      position: absolute;
      top: 2px;
      inset-inline-start: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: currentColor;
      transition: inset-inline-start 0.15s ease;
    }
    .toggle.on { background: var(--sab-accent); }
    .toggle.on .knob { inset-inline-start: 18px; background: white; }
    .tile.on .toggle { background: rgba(0,0,0,0.25); }
    .tile.on .toggle.on { background: rgba(255,255,255,0.4); }
    .tile.on .toggle.on .knob { background: white; }

    .media-controls {
      display: flex;
      gap: 0.4rem;
      margin-top: 0.55rem;
      align-items: center;
      justify-content: center;
    }
    .mc {
      flex: 1;
      min-width: 0;
      padding: 0.45rem 0.6rem;
      border: 0;
      border-radius: 8px;
      background: rgba(0,0,0,0.12);
      color: currentColor;
      font-size: 0.95rem;
      cursor: pointer;
      line-height: 1;
    }
    .mc:hover { background: rgba(0,0,0,0.2); }
    .tile.on .mc { background: rgba(255,255,255,0.18); }
    .tile.on .mc:hover { background: rgba(255,255,255,0.28); }
    .mc.primary-mc { flex: 1.2; font-size: 1.1rem; }
    .mc.active { background: var(--sab-accent); color: white; }
  `;
}

function sliderValueForBinding(b: AttributeBinding, e?: HassEntity): number {
  if (!e) return 0;
  const v = e.attributes[b.attribute];
  if (b.attribute === 'brightness' && typeof v === 'number') return Math.round((v / 255) * 100);
  if (b.attribute === 'volume_level' && typeof v === 'number') return Math.round(v * 100);
  if (typeof v === 'number') return Math.round(v);
  if (b.attribute === 'temperature') {
    const t = e.attributes['temperature'];
    if (typeof t === 'number') return t;
  }
  return 0;
}

function sliderMin(b: AttributeBinding): number {
  if (b.attribute === 'temperature') return 7;
  return 0;
}
function sliderMax(b: AttributeBinding): number {
  if (b.attribute === 'temperature') return 30;
  return 100;
}
function sliderStep(b: AttributeBinding): number {
  if (b.attribute === 'temperature') return 0.5;
  return 1;
}

function formatAttr(e: HassEntity | undefined, attr: string): string {
  if (!e) return '';
  if (attr === 'state') return e.state;
  const v = e.attributes[attr];
  if (v == null) return '';
  if (typeof v === 'number') {
    if (attr === 'brightness') return `${Math.round((v / 255) * 100)}%`;
    if (attr === 'volume_level') return `${Math.round(v * 100)}%`;
    if (attr === 'battery_level') return `${Math.round(v)}%`;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
  return String(v);
}

function prettyAttr(attr: string): string {
  return attr.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    return s === 'on' || s === 'open' || s === 'unlocked' || s === 'playing' || s === 'cleaning' || s === 'true' || s === 'home' || s === 'heat' || s === 'cool' || s === 'auto';
  }
  return false;
}

function defaultStateLine(family: DeviceFamily, e: HassEntity): string {
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
    if (cur != null) return `${cur}°`;
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
  if (family === 'light' && e.state === 'on') {
    const b = e.attributes['brightness'];
    if (typeof b === 'number') return `${Math.round((b / 255) * 100)}%`;
  }
  return e.state;
}

interface CustomCardEntry { type: string; name: string; description: string; preview?: boolean }
declare global {
  interface Window { customCards?: CustomCardEntry[] }
  interface HTMLElementTagNameMap { 'sab-tile-card': SabTileCard }
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
